import { semanticDigest } from "../integrity/canonical.js";
import type { CompileResult } from "../model.js";
import type {
  ObservationSource,
  ProcessObservation,
} from "./model.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function source(value: unknown): ObservationSource | undefined {
  const input = record(value);
  if (input === undefined || !nonempty(input.kind)) return undefined;
  switch (input.kind) {
    case "machine-feedback":
      return nonempty(input.systemId) && nonempty(input.channel)
        ? {
            kind: "machine-feedback",
            systemId: input.systemId,
            channel: input.channel,
          }
        : undefined;
    case "metrology":
      return nonempty(input.systemId) && nonempty(input.method)
        ? {
            kind: "metrology",
            systemId: input.systemId,
            method: input.method,
          }
        : undefined;
    case "human":
      return nonempty(input.operatorId) && nonempty(input.role)
        ? {
            kind: "human",
            operatorId: input.operatorId,
            role: input.role,
          }
        : undefined;
    default:
      return undefined;
  }
}

function compileError(code: string, detail: string): CompileResult<never> {
  return { _tag: "CompileError", code, detail };
}

function compiled(
  value: ProcessObservation,
): CompileResult<ProcessObservation> {
  return {
    _tag: "Compiled",
    value,
    digest: semanticDigest(value),
  };
}

export function compileProcessObservation(
  value: unknown,
): CompileResult<ProcessObservation> {
  const input = record(value);
  if (
    input === undefined ||
    input.schema !== "gmr.process-observation/v1" ||
    !nonempty(input.id) ||
    !nonempty(input.kind)
  ) {
    return compileError(
      "invalid-process-observation",
      "observation requires schema, id, kind, and source",
    );
  }
  const observationSource = source(input.source);
  if (observationSource === undefined) {
    return compileError(
      "invalid-observation-source",
      "observation source is incomplete or unsupported",
    );
  }

  switch (input.kind) {
    case "dimensional-trend":
      if (
        !nonempty(input.characteristicId) ||
        !Array.isArray(input.valuesMm) ||
        input.valuesMm.length < 3 ||
        !input.valuesMm.every(finite) ||
        !finite(input.lowerLimitMm) ||
        !finite(input.upperLimitMm) ||
        input.lowerLimitMm >= input.upperLimitMm ||
        !nonempty(input.measurementSystemId)
      ) {
        return compileError(
          "invalid-dimensional-trend",
          "dimensional trend requires >=3 finite measurements, valid limits, and measurement-system identity",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "dimensional-trend",
        characteristicId: input.characteristicId,
        valuesMm: input.valuesMm as readonly number[],
        lowerLimitMm: input.lowerLimitMm,
        upperLimitMm: input.upperLimitMm,
        measurementSystemId: input.measurementSystemId,
      });
    case "fixture-distortion":
      if (
        !nonempty(input.characteristicId) ||
        !finite(input.unclampedFlatnessMm) ||
        !finite(input.clampedFlatnessMm) ||
        !finite(input.clampForceScale) ||
        input.clampForceScale <= 0 ||
        !nonempty(input.measurementSystemId)
      ) {
        return compileError(
          "invalid-fixture-distortion",
          "fixture distortion requires finite unclamped/clamped flatness, clamp-force scale, and measurement-system identity",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "fixture-distortion",
        characteristicId: input.characteristicId,
        unclampedFlatnessMm: input.unclampedFlatnessMm,
        clampedFlatnessMm: input.clampedFlatnessMm,
        clampForceScale: input.clampForceScale,
        measurementSystemId: input.measurementSystemId,
      });
    case "vibration":
      if (
        !nonempty(input.toolId) ||
        !finite(input.chatterIndex) ||
        input.chatterIndex < 0 ||
        !finite(input.rmsAccelerationG) ||
        input.rmsAccelerationG < 0
      ) {
        return compileError(
          "invalid-vibration-observation",
          "vibration observation requires nonnegative chatter and RMS values",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "vibration",
        toolId: input.toolId,
        chatterIndex: input.chatterIndex,
        rmsAccelerationG: input.rmsAccelerationG,
      });
    case "human-correction":
      if (
        observationSource.kind !== "human" ||
        (input.field !== "tool-stickout-mm" &&
          input.field !== "clamp-force-scale") ||
        !finite(input.previousValue) ||
        !finite(input.correctedValue) ||
        !nonempty(input.reason) ||
        (input.field === "tool-stickout-mm" && !nonempty(input.toolId))
      ) {
        return compileError(
          "invalid-human-correction",
          "human correction requires human source, supported field, finite values, reason, and tool identity when applicable",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "human-correction",
        field: input.field,
        ...(input.field === "tool-stickout-mm"
          ? { toolId: input.toolId as string }
          : {}),
        previousValue: input.previousValue,
        correctedValue: input.correctedValue,
        reason: input.reason,
      });
    case "gage-rr":
      if (
        !nonempty(input.measurementSystemId) ||
        !finite(input.percentGrr) ||
        input.percentGrr < 0 ||
        !finite(input.ndc) ||
        input.ndc < 0 ||
        !finite(input.repeatabilityMm) ||
        input.repeatabilityMm < 0 ||
        !finite(input.reproducibilityMm) ||
        input.reproducibilityMm < 0
      ) {
        return compileError(
          "invalid-gage-rr",
          "gage R&R observation requires nonnegative variability metrics and measurement-system identity",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "gage-rr",
        measurementSystemId: input.measurementSystemId,
        percentGrr: input.percentGrr,
        ndc: input.ndc,
        repeatabilityMm: input.repeatabilityMm,
        reproducibilityMm: input.reproducibilityMm,
      });
    case "thermal-drift":
      if (
        !finite(input.baselineTemperatureC) ||
        !finite(input.currentTemperatureC) ||
        (input.axis !== "x" && input.axis !== "y" && input.axis !== "z") ||
        !finite(input.measuredBiasMm) ||
        !nonempty(input.measurementSystemId)
      ) {
        return compileError(
          "invalid-thermal-drift",
          "thermal drift requires temperatures, axis, measured bias, and measurement-system identity",
        );
      }
      return compiled({
        schema: "gmr.process-observation/v1",
        id: input.id,
        source: observationSource,
        kind: "thermal-drift",
        baselineTemperatureC: input.baselineTemperatureC,
        currentTemperatureC: input.currentTemperatureC,
        axis: input.axis,
        measuredBiasMm: input.measuredBiasMm,
        measurementSystemId: input.measurementSystemId,
      });
    default:
      return compileError(
        "unsupported-process-observation",
        "unsupported process observation kind " + input.kind,
      );
  }
}

export function compileProcessObservations(
  values: readonly unknown[],
): CompileResult<readonly ProcessObservation[]> {
  const compiledValues: ProcessObservation[] = [];
  for (const [index, value] of values.entries()) {
    const result = compileProcessObservation(value);
    if (result._tag !== "Compiled") {
      return {
        ...result,
        detail:
          "observation[" + index + "]: " + result.detail,
      };
    }
    compiledValues.push(result.value);
  }
  return {
    _tag: "Compiled",
    value: compiledValues,
    digest: semanticDigest(compiledValues),
  };
}
