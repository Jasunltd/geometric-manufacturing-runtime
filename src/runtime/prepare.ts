import { Data, Effect } from "effect";
import { bindExecutionPlan } from "../execution/bind.js";
import type {
  MachineModel,
  ManufacturingProgram,
  PreparedExecutionArtifact,
} from "../model.js";
import {
  MotionArtifactBackend,
  PhysicalStateSource,
} from "./services.js";

export class PreparationFailure extends Data.TaggedError(
  "PreparationFailure",
)<{
  readonly code: string;
  readonly detail: string;
}> {}

export const prepareExecutionArtifact = (
  program: ManufacturingProgram,
  machine: MachineModel,
): Effect.Effect<
  PreparedExecutionArtifact,
  | PreparationFailure
  | import("./services.js").PhysicalStateSourceFailure
  | import("./services.js").MotionArtifactBackendFailure,
  PhysicalStateSource | MotionArtifactBackend
> =>
  Effect.gen(function* () {
    const physicalState = yield* PhysicalStateSource;
    const backend = yield* MotionArtifactBackend;

    const snapshot = yield* physicalState.read({
      machineId: machine.id,
      toolIds: program.definition.tools.map((tool) => tool.id),
    });

    const binding = bindExecutionPlan(program, machine, snapshot);
    if (binding._tag === "Refused") {
      return yield* Effect.fail(
        new PreparationFailure({
          code: binding.code,
          detail: binding.detail,
        }),
      );
    }

    const artifact = yield* backend.lower(binding.plan);
    return {
      plan: binding.plan,
      artifact,
      stateSnapshot: snapshot,
    };
  });
