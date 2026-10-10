import assert from "node:assert/strict";
import test from "node:test";
import {
  bindExecutionPlan,
  compileMachineModel,
  compileManufacturingProgram,
  compilePhysicalStateSnapshot,
  lowerExecutionPlanToGcode,
} from "../src/index.js";
import { machineInput, programInput, stateInput } from "./fixtures.js";

function compiledFixtures(measuredDiameter = 9.8) {
  const program = compileManufacturingProgram(programInput);
  const machine = compileMachineModel(machineInput);
  const state = compilePhysicalStateSnapshot(
    stateInput(measuredDiameter),
  );
  assert.equal(program._tag, "Compiled");
  assert.equal(machine._tag, "Compiled");
  assert.equal(state._tag, "Compiled");
  if (
    program._tag !== "Compiled" ||
    machine._tag !== "Compiled" ||
    state._tag !== "Compiled"
  ) {
    throw new Error("fixture compilation failed");
  }
  return {
    program: program.value,
    machine: machine.value,
    state: state.value,
  };
}

test("late binding changes the execution plan but preserves canonical geometry", () => {
  const nominal = compiledFixtures(10);
  const worn = compiledFixtures(9.8);

  const nominalBinding = bindExecutionPlan(
    nominal.program,
    nominal.machine,
    nominal.state,
  );
  const wornBinding = bindExecutionPlan(
    worn.program,
    worn.machine,
    worn.state,
  );

  assert.equal(nominalBinding._tag, "Bound");
  assert.equal(wornBinding._tag, "Bound");
  if (
    nominalBinding._tag !== "Bound" ||
    wornBinding._tag !== "Bound"
  ) {
    return;
  }

  assert.equal(
    nominalBinding.plan.canonicalGeometryDigest,
    wornBinding.plan.canonicalGeometryDigest,
  );
  assert.equal(
    wornBinding.plan.canonicalGeometryDigest,
    worn.program.geometryDigest,
  );
  assert.notEqual(
    nominalBinding.plan.planDigest,
    wornBinding.plan.planDigest,
  );

  assert.equal(nominalBinding.plan.motion.length, 1);
  assert.equal(wornBinding.plan.motion.length, 2);
  assert.ok(
    Math.abs(
      (wornBinding.plan.compensation[0]?.radialDelta ?? NaN) - 0.1,
    ) < 1e-12,
  );
});

test("same program, machine, and state bind deterministically", () => {
  const fixture = compiledFixtures(9.8);
  const first = bindExecutionPlan(
    fixture.program,
    fixture.machine,
    fixture.state,
  );
  const second = bindExecutionPlan(
    fixture.program,
    fixture.machine,
    fixture.state,
  );
  assert.equal(first._tag, "Bound");
  assert.equal(second._tag, "Bound");
  if (first._tag !== "Bound" || second._tag !== "Bound") return;

  assert.equal(first.plan.planDigest, second.plan.planDigest);
  assert.deepEqual(first.plan, second.plan);
});

test("oversized measured tool refuses instead of shrinking canonical geometry", () => {
  const fixture = compiledFixtures(10.2);
  const binding = bindExecutionPlan(
    fixture.program,
    fixture.machine,
    fixture.state,
  );
  assert.deepEqual(binding._tag, "Refused");
  if (binding._tag === "Refused") {
    assert.equal(binding.code, "tool-too-large");
  }
});

test("stale physical state refuses before planning", () => {
  const fixture = compiledFixtures();
  const staleState = {
    ...fixture.state,
    freshness: {
      state: "stale" as const,
      observedAt: "2026-10-04T18:00:00Z",
      reason: "tool setter has not reported since spindle restart",
    },
  };
  const binding = bindExecutionPlan(
    fixture.program,
    fixture.machine,
    staleState,
  );
  assert.equal(binding._tag, "Refused");
  if (binding._tag === "Refused") {
    assert.equal(binding.code, "stale-physical-state");
  }
});

test("legacy G-code is a deterministic artifact of the execution plan", () => {
  const fixture = compiledFixtures(9.8);
  const binding = bindExecutionPlan(
    fixture.program,
    fixture.machine,
    fixture.state,
  );
  assert.equal(binding._tag, "Bound");
  if (binding._tag !== "Bound") return;

  const first = lowerExecutionPlanToGcode(binding.plan);
  const second = lowerExecutionPlanToGcode(binding.plan);
  assert.equal(first.artifactDigest, second.artifactDigest);
  assert.equal(first.text, second.text);
  assert.match(first.text, /G21/);
  assert.match(first.text, /G90/);
  assert.match(first.text, /G2 /);
  assert.match(first.text, new RegExp(binding.plan.canonicalGeometryDigest));
});
