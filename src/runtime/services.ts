import { Context, Data, Effect, Layer } from "effect";
import { lowerExecutionPlanToGcode } from "../backends/gcode.js";
import type {
  ExecutionPlan,
  GCodeArtifact,
  PhysicalStateSnapshot,
} from "../model.js";

export class PhysicalStateSourceFailure extends Data.TaggedError(
  "PhysicalStateSourceFailure",
)<{
  readonly code: string;
  readonly detail: string;
}> {}

export interface PhysicalStateSource {
  readonly read: (request: {
    readonly machineId: string;
    readonly toolIds: readonly string[];
  }) => Effect.Effect<PhysicalStateSnapshot, PhysicalStateSourceFailure>;
}

export const PhysicalStateSource =
  Context.GenericTag<PhysicalStateSource>(
    "geometric-manufacturing-runtime/PhysicalStateSource",
  );

export function staticPhysicalStateSourceLayer(
  snapshot: PhysicalStateSnapshot,
): Layer.Layer<PhysicalStateSource> {
  return Layer.succeed(
    PhysicalStateSource,
    PhysicalStateSource.of({
      read: ({ machineId, toolIds }) => {
        if (snapshot.machineId !== machineId) {
          return Effect.fail(
            new PhysicalStateSourceFailure({
              code: "machine-id-mismatch",
              detail: `static snapshot belongs to ${snapshot.machineId}, not ${machineId}`,
            }),
          );
        }
        const available = new Set(
          snapshot.toolMeasurements.map((measurement) => measurement.toolId),
        );
        const missing = toolIds.filter((toolId) => !available.has(toolId));
        if (missing.length > 0) {
          return Effect.fail(
            new PhysicalStateSourceFailure({
              code: "missing-tool-measurement",
              detail: `static snapshot lacks: ${missing.join(", ")}`,
            }),
          );
        }
        return Effect.succeed(snapshot);
      },
    }),
  );
}

export class MotionArtifactBackendFailure extends Data.TaggedError(
  "MotionArtifactBackendFailure",
)<{
  readonly backend: string;
  readonly code: string;
  readonly detail: string;
}> {}

export interface MotionArtifactBackend {
  readonly lower: (
    plan: ExecutionPlan,
  ) => Effect.Effect<GCodeArtifact, MotionArtifactBackendFailure>;
}

export const MotionArtifactBackend =
  Context.GenericTag<MotionArtifactBackend>(
    "geometric-manufacturing-runtime/MotionArtifactBackend",
  );

export const GCodeMotionArtifactBackendLive =
  Layer.succeed(
    MotionArtifactBackend,
    MotionArtifactBackend.of({
      lower: (plan) =>
        Effect.try({
          try: () => lowerExecutionPlanToGcode(plan),
          catch: (cause) =>
            new MotionArtifactBackendFailure({
              backend: "generic-rs274",
              code: "lowering-failed",
              detail: String(cause),
            }),
        }),
    }),
  );
