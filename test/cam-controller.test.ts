import assert from "node:assert/strict";
import test from "node:test";
import {
  HaasNgcProfile,
  LinuxCncProfile,
  compileDesignProblem,
  compileMotionProgram,
  planCandidateManufacturing,
  postMotionProgram,
  synthesizeDesignSpace,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function compiledFlow() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") {
    throw new Error("fixture failed");
  }
  const synthesis = synthesizeDesignSpace(compiled.value);
  const selected = synthesis.feasibleCandidates[0];
  assert.ok(selected);
  const plan = planCandidateManufacturing(
    compiled.value,
    selected,
  );
  const motion = compileMotionProgram(plan);
  return { plan, motion };
}

test("CAM lowers to controller-neutral motion before controller semantics", () => {
  const { plan, motion } = compiledFlow();
  assert.equal(motion.manufacturingPlanDigest, plan.planDigest);
  assert.ok(
    motion.commands.some((command) => command._tag === "DrillCycle"),
  );
  assert.ok(
    motion.commands.some((command) => command._tag === "BoreCycle"),
  );
  assert.ok(
    motion.commands.some(
      (command) => command._tag === "CutterCompLeadIn",
    ),
  );
  assert.ok(
    motion.commands.some(
      (command) => command._tag === "CutterCompLeadOut",
    ),
  );
});

test("same Motion IR posts with target semantics and safe compensation transitions", () => {
  const { motion } = compiledFlow();
  const haas = postMotionProgram(motion, HaasNgcProfile);
  const linux = postMotionProgram(motion, LinuxCncProfile);

  assert.equal(haas.motionDigest, linux.motionDigest);
  assert.notEqual(haas.artifactDigest, linux.artifactDigest);

  assert.match(haas.text, /^%\nO01001/m);
  assert.match(haas.text, /G40\nG49\nG54/);
  assert.match(haas.text, /G43 H02 Z8/);
  assert.match(haas.text, /G01 G41 D04 X0 Y24 F900/);
  assert.match(haas.text, /G01 G40 X-10 Y24 F900/);
  assert.match(haas.text, /M30\n%\n$/);

  assert.doesNotMatch(linux.text, /^O\d+/m);
  assert.match(linux.text, /G40\nG49\nG54/);
  assert.match(linux.text, /G43 H02\nG00 Z8/);
  assert.match(linux.text, /G01 G41 D04 X0 Y24 F900/);
  assert.match(linux.text, /G01 G40 X-10 Y24 F900/);
  assert.match(linux.text, /M2\n$/);

  for (const line of haas.text.split("\n")) {
    const mCodes = line.match(/\bM\d+\b/gi) ?? [];
    assert.ok(
      mCodes.length <= 1,
      "Haas block contains multiple M codes: " + line,
    );
  }
});

test("CAM refuses a feasible candidate from a different DesignProblem", () => {
  const original = compileDesignProblem(designProblemInput);
  assert.equal(original._tag, "Compiled");
  if (original._tag !== "Compiled") return;
  const selected = synthesizeDesignSpace(
    original.value,
  ).feasibleCandidates[0];
  assert.ok(selected);
  const changed = compileDesignProblem({
    ...designProblemInput,
    requirements: {
      ...designProblemInput.requirements,
      maxTipDeflectionMm: 0.07,
    },
  });
  assert.equal(changed._tag, "Compiled");
  if (changed._tag !== "Compiled") return;
  assert.throws(
    () => planCandidateManufacturing(changed.value, selected),
    /different DesignProblem identity/,
  );
});