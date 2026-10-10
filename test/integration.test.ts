import assert from "node:assert/strict";
import test from "node:test";
import {
  bindExecutionPlan,
  buildFullSystemTrace,
  compileMachineModel,
  compileManufacturingProgram,
  compilePhysicalStateSnapshot,
} from "../src/index.js";
import type { Digest } from "../src/model.js";
import { machineInput, programInput, stateInput } from "./fixtures.js";

const digest = (character: string): Digest =>
  `sha256:${character.repeat(64)}`;

test("full-system trace binds cross-lane evidence by exact identity without changing authority", () => {
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

  const binding = bindExecutionPlan(
    program.value,
    machine.value,
    state.value,
  );
  assert.equal(binding._tag, "Bound");
  if (binding._tag !== "Bound") return;

  const trace = buildFullSystemTrace({
    program: program.value,
    plan: binding.plan,
    engineeringEvidence: {
      schema: "gmr.engineering-evidence-binding/v1",
      researchPackDigest: digest("a"),
      subjectRevisionDigest: digest("b"),
      requirementIds: ["stiffness-1", "interface-2"],
      limitations: ["synthetic clean-room evidence"],
    },
    cyberPhysicalEvidence: {
      schema: "gmr.cyber-physical-evidence-binding/v1",
      sourceId: "robot-cell-statemap-projection",
      upstreamEvidenceDigest: digest("c"),
      stateSnapshotId: state.value.snapshotId,
    },
  });

  assert.equal(trace.canonicalGeometryDigest, program.value.geometryDigest);
  assert.equal(trace.planDigest, binding.plan.planDigest);
  assert.equal(
    trace.cyberPhysicalEvidence?.stateSnapshotId,
    binding.plan.stateSnapshotId,
  );
  assert.ok(trace.traceDigest.startsWith("sha256:"));
});

test("full-system trace rejects a mismatched cyber-physical snapshot identity", () => {
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

  const binding = bindExecutionPlan(
    program.value,
    machine.value,
    state.value,
  );
  assert.equal(binding._tag, "Bound");
  if (binding._tag !== "Bound") return;

  assert.throws(
    () =>
      buildFullSystemTrace({
        program: program.value,
        plan: binding.plan,
        cyberPhysicalEvidence: {
          schema: "gmr.cyber-physical-evidence-binding/v1",
          sourceId: "bad-binding",
          upstreamEvidenceDigest: digest("d"),
          stateSnapshotId: "different-snapshot",
        },
      }),
    /does not identify the execution plan state snapshot/,
  );
});
