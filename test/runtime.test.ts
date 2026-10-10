import assert from "node:assert/strict";
import test from "node:test";
import { Effect, Layer } from "effect";
import {
  compileMachineModel,
  compileManufacturingProgram,
} from "../src/index.js";
import {
  GCodeMotionArtifactBackendLive,
  MotionArtifactBackend,
  PhysicalStateSource,
  prepareExecutionArtifact,
  staticPhysicalStateSourceLayer,
} from "../src/runtime/index.js";
import {
  compilePhysicalStateSnapshot,
} from "../src/boundary/index.js";
import { machineInput, programInput, stateInput } from "./fixtures.js";

test("Effect runtime composes state acquisition and artifact lowering without owning geometry", async () => {
  const program = compileManufacturingProgram(programInput);
  const machine = compileMachineModel(machineInput);
  const state = compilePhysicalStateSnapshot(stateInput(9.8));
  assert.equal(program._tag, "Compiled");
  assert.equal(machine._tag, "Compiled");
  assert.equal(state._tag, "Compiled");
  if (
    program._tag !== "Compiled" ||
    machine._tag !== "Compiled" ||
    state._tag !== "Compiled"
  ) {
    return;
  }

  const services = Layer.merge(
    staticPhysicalStateSourceLayer(state.value),
    GCodeMotionArtifactBackendLive,
  );

  const prepared = await Effect.runPromise(
    prepareExecutionArtifact(program.value, machine.value).pipe(
      Effect.provide(services),
    ),
  );

  assert.equal(
    prepared.plan.canonicalGeometryDigest,
    program.value.geometryDigest,
  );
  assert.equal(
    prepared.artifact.planDigest,
    prepared.plan.planDigest,
  );

  void PhysicalStateSource;
  void MotionArtifactBackend;
});
