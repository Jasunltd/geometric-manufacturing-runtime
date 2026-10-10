import type {
  AxisRange,
  CompileResult,
  MachineModel,
  PhysicalStateSnapshot,
  ToolMeasurement,
} from "../model.js";
import { semanticDigest } from "../integrity/canonical.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const n = finiteNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function axisRange(value: unknown, axis: string): CompileResult<AxisRange> {
  const source = record(value);
  const min = source === undefined ? undefined : finiteNumber(source.min);
  const max = source === undefined ? undefined : finiteNumber(source.max);
  if (min === undefined || max === undefined || !(min < max)) {
    return { _tag: "CompileError", code: "invalid-envelope", detail: `${axis} envelope requires finite min < max` };
  }
  const range: AxisRange = { min, max };
  return { _tag: "Compiled", value: range, digest: semanticDigest(range) };
}

export function compileMachineModel(input: unknown): CompileResult<MachineModel> {
  const source = record(input);
  if (source === undefined) {
    return { _tag: "CompileError", code: "invalid-machine", detail: "machine input must be an object" };
  }
  if (source.schema !== "gmr.machine/v1") {
    return { _tag: "Unsupported", code: "unsupported-machine-schema", detail: "expected gmr.machine/v1" };
  }
  const id = stringValue(source.id);
  if (id === undefined) {
    return { _tag: "CompileError", code: "invalid-machine-id", detail: "machine id is required" };
  }
  if (source.units !== "mm") {
    return { _tag: "Unsupported", code: "unsupported-machine-units", detail: "v0.1 supports millimeters only" };
  }
  if (!Array.isArray(source.axes) || source.axes.length !== 3 || source.axes[0] !== "X" || source.axes[1] !== "Y" || source.axes[2] !== "Z") {
    return { _tag: "Unsupported", code: "unsupported-axes", detail: "v0.1 supports exactly XYZ machines" };
  }
  const envelope = record(source.workEnvelope);
  if (envelope === undefined) {
    return { _tag: "CompileError", code: "invalid-envelope", detail: "workEnvelope is required" };
  }
  const x = axisRange(envelope.x, "x");
  const y = axisRange(envelope.y, "y");
  const z = axisRange(envelope.z, "z");
  if (x._tag !== "Compiled") return x;
  if (y._tag !== "Compiled") return y;
  if (z._tag !== "Compiled") return z;

  const safeZ = finiteNumber(source.safeZ);
  const feedMmPerMin = positiveNumber(source.feedMmPerMin);
  if (safeZ === undefined || feedMmPerMin === undefined) {
    return { _tag: "CompileError", code: "invalid-machine-motion", detail: "safeZ and positive feedMmPerMin are required" };
  }
  if (source.supportsCircularInterpolation !== true && source.supportsCircularInterpolation !== false) {
    return { _tag: "CompileError", code: "invalid-machine-capability", detail: "supportsCircularInterpolation must be boolean" };
  }

  const machine: MachineModel = {
    schema: "gmr.machine/v1",
    id,
    units: "mm",
    axes: ["X", "Y", "Z"],
    workEnvelope: { x: x.value, y: y.value, z: z.value },
    safeZ,
    feedMmPerMin,
    supportsCircularInterpolation: source.supportsCircularInterpolation,
  };
  return { _tag: "Compiled", value: machine, digest: semanticDigest(machine) };
}

function decodeMeasurement(value: unknown, index: number): CompileResult<ToolMeasurement> {
  const source = record(value);
  const toolId = source === undefined ? undefined : stringValue(source.toolId);
  const measuredDiameter = source === undefined ? undefined : positiveNumber(source.measuredDiameter);
  if (toolId === undefined || measuredDiameter === undefined) {
    return { _tag: "CompileError", code: "invalid-tool-measurement", detail: `toolMeasurements[${index}] requires toolId and positive measuredDiameter` };
  }
  const measurement: ToolMeasurement = { toolId, measuredDiameter };
  return { _tag: "Compiled", value: measurement, digest: semanticDigest(measurement) };
}

export function compilePhysicalStateSnapshot(input: unknown): CompileResult<PhysicalStateSnapshot> {
  const source = record(input);
  if (source === undefined) {
    return { _tag: "CompileError", code: "invalid-state", detail: "physical state input must be an object" };
  }
  if (source.schema !== "gmr.physical-state/v1") {
    return { _tag: "Unsupported", code: "unsupported-state-schema", detail: "expected gmr.physical-state/v1" };
  }
  const snapshotId = stringValue(source.snapshotId);
  const machineId = stringValue(source.machineId);
  if (snapshotId === undefined || machineId === undefined) {
    return { _tag: "CompileError", code: "invalid-state-identity", detail: "snapshotId and machineId are required" };
  }
  if (source.workOffset !== "G54") {
    return { _tag: "Unsupported", code: "unsupported-work-offset", detail: "v0.1 supports G54 only" };
  }
  if (!Array.isArray(source.toolMeasurements) || source.toolMeasurements.length === 0) {
    return { _tag: "CompileError", code: "invalid-tool-measurements", detail: "at least one tool measurement is required" };
  }
  const toolMeasurements: ToolMeasurement[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of source.toolMeasurements.entries()) {
    const decoded = decodeMeasurement(raw, index);
    if (decoded._tag !== "Compiled") return decoded;
    if (seen.has(decoded.value.toolId)) {
      return { _tag: "CompileError", code: "duplicate-tool-measurement", detail: `duplicate measurement for ${decoded.value.toolId}` };
    }
    seen.add(decoded.value.toolId);
    toolMeasurements.push(decoded.value);
  }

  const freshnessSource = record(source.freshness);
  const observedAt = freshnessSource === undefined ? undefined : stringValue(freshnessSource.observedAt);
  if (freshnessSource === undefined || observedAt === undefined) {
    return { _tag: "CompileError", code: "invalid-freshness", detail: "freshness with observedAt is required" };
  }
  const freshness =
    freshnessSource.state === "current"
      ? ({ state: "current", observedAt } as const)
      : freshnessSource.state === "stale" && stringValue(freshnessSource.reason) !== undefined
        ? ({ state: "stale", observedAt, reason: stringValue(freshnessSource.reason)! } as const)
        : undefined;
  if (freshness === undefined) {
    return { _tag: "CompileError", code: "invalid-freshness", detail: "freshness must be current or stale with reason" };
  }

  const snapshot: PhysicalStateSnapshot = {
    schema: "gmr.physical-state/v1",
    snapshotId,
    machineId,
    workOffset: "G54",
    toolMeasurements,
    freshness,
  };
  return { _tag: "Compiled", value: snapshot, digest: semanticDigest(snapshot) };
}
