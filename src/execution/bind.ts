import { semanticDigest } from "../integrity/canonical.js";
import type {
  BindingResult,
  ExecutionPlan,
  MachineModel,
  ManufacturingProgram,
  MotionPrimitive,
  PhysicalStateSnapshot,
  RadialCompensation,
} from "../model.js";

const EPSILON = 1e-9;

function inRange(value: number, min: number, max: number): boolean {
  return value >= min - EPSILON && value <= max + EPSILON;
}

function operationEnvelopeFits(
  program: ManufacturingProgram,
  machine: MachineModel,
): boolean {
  for (const geometry of program.geometry) {
    const minX = Math.min(geometry.start.x, geometry.end.x) - geometry.radius;
    const maxX = Math.max(geometry.start.x, geometry.end.x) + geometry.radius;
    const minY = Math.min(geometry.start.y, geometry.end.y) - geometry.radius;
    const maxY = Math.max(geometry.start.y, geometry.end.y) + geometry.radius;

    if (
      !inRange(minX, machine.workEnvelope.x.min, machine.workEnvelope.x.max) ||
      !inRange(maxX, machine.workEnvelope.x.min, machine.workEnvelope.x.max) ||
      !inRange(minY, machine.workEnvelope.y.min, machine.workEnvelope.y.max) ||
      !inRange(maxY, machine.workEnvelope.y.min, machine.workEnvelope.y.max) ||
      !inRange(geometry.bottomZ, machine.workEnvelope.z.min, machine.workEnvelope.z.max) ||
      !inRange(geometry.topZ, machine.workEnvelope.z.min, machine.workEnvelope.z.max)
    ) {
      return false;
    }
  }

  return inRange(
    machine.safeZ,
    machine.workEnvelope.z.min,
    machine.workEnvelope.z.max,
  );
}

export function bindExecutionPlan(
  program: ManufacturingProgram,
  machine: MachineModel,
  state: PhysicalStateSnapshot,
): BindingResult {
  if (state.machineId !== machine.id) {
    return {
      _tag: "Refused",
      code: "machine-id-mismatch",
      detail: `state snapshot ${state.snapshotId} belongs to ${state.machineId}, not ${machine.id}`,
    };
  }

  if (state.freshness.state === "stale") {
    return {
      _tag: "Refused",
      code: "stale-physical-state",
      detail: `state snapshot ${state.snapshotId} is stale: ${state.freshness.reason}`,
    };
  }

  if (!operationEnvelopeFits(program, machine)) {
    return {
      _tag: "Refused",
      code: "outside-machine-envelope",
      detail: "canonical generated geometry or safe Z lies outside the declared XYZ work envelope",
    };
  }

  const measurementByTool = new Map(
    state.toolMeasurements.map((measurement) => [
      measurement.toolId,
      measurement,
    ] as const),
  );
  const toolById = new Map(
    program.definition.tools.map((tool) => [tool.id, tool] as const),
  );
  const operationById = new Map(
    program.definition.operations.map((operation) => [
      operation.id,
      operation,
    ] as const),
  );

  const compensation: RadialCompensation[] = [];
  const motion: MotionPrimitive[] = [];

  for (const geometry of program.geometry) {
    const nominalTool = toolById.get(geometry.toolId);
    const operation = operationById.get(geometry.operationId);
    const measurement = measurementByTool.get(geometry.toolId);

    if (nominalTool === undefined || operation === undefined) {
      throw new TypeError(
        `compiled program lost internal binding for operation ${geometry.operationId}`,
      );
    }

    if (measurement === undefined) {
      return {
        _tag: "Refused",
        code: "missing-tool-measurement",
        detail: `state snapshot lacks a measurement for tool ${geometry.toolId}`,
      };
    }

    const nominalRadius = nominalTool.nominalDiameter / 2;
    const actualRadius = measurement.measuredDiameter / 2;
    const radialDelta = nominalRadius - actualRadius;

    if (radialDelta < -EPSILON) {
      return {
        _tag: "Refused",
        code: "tool-too-large",
        detail: `measured tool ${geometry.toolId} is larger than the nominal generating tool; v0.1 will not shrink canonical generated geometry`,
      };
    }

    if (radialDelta > operation.maxRadialCompensation + EPSILON) {
      return {
        _tag: "Refused",
        code: "compensation-limit",
        detail: `required radial compensation ${radialDelta} exceeds operation limit ${operation.maxRadialCompensation}`,
      };
    }

    if (radialDelta > actualRadius + EPSILON) {
      return {
        _tag: "Refused",
        code: "coverage-gap-risk",
        detail: `required radial compensation ${radialDelta} exceeds the measured tool radius ${actualRadius}; the bounded v0.1 centerline+boundary construction cannot prove complete coverage`,
      };
    }

    if (radialDelta > EPSILON && !machine.supportsCircularInterpolation) {
      return {
        _tag: "Refused",
        code: "circular-interpolation-required",
        detail: "measured-tool compensation requires circular interpolation in the v0.1 backend",
      };
    }

    compensation.push({
      operationId: geometry.operationId,
      toolId: geometry.toolId,
      nominalDiameter: nominalTool.nominalDiameter,
      measuredDiameter: measurement.measuredDiameter,
      radialDelta: Math.max(0, radialDelta),
    });

    motion.push({
      _tag: "CenterlineSweep",
      operationId: geometry.operationId,
      toolId: geometry.toolId,
      start: geometry.start,
      end: geometry.end,
      z: geometry.bottomZ,
    });

    if (radialDelta > EPSILON) {
      motion.push({
        _tag: "OffsetCapsuleBoundarySweep",
        operationId: geometry.operationId,
        toolId: geometry.toolId,
        start: geometry.start,
        end: geometry.end,
        z: geometry.bottomZ,
        offsetRadius: radialDelta,
      });
    }
  }

  const planWithoutDigest = {
    schema: "gmr.execution-plan/v1" as const,
    programDefinitionDigest: program.definitionDigest,
    canonicalGeometryDigest: program.geometryDigest,
    machineId: machine.id,
    stateSnapshotId: state.snapshotId,
    workOffset: state.workOffset,
    safeZ: machine.safeZ,
    feedMmPerMin: machine.feedMmPerMin,
    compensation,
    motion,
  };

  const planDigest = semanticDigest(planWithoutDigest);
  const plan: ExecutionPlan = {
    ...planWithoutDigest,
    planDigest,
  };

  return { _tag: "Bound", plan };
}
