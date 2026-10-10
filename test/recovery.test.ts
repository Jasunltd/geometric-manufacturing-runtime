import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  applyRecoveryAction,
  assessProcessException,
  compileDesignProblem,
  compileMotionProgram,
  compileProcessObservation,
  createProcessControlState,
  planCandidateManufacturing,
  renderRecoveryCaseStudyMarkdown,
  runProcessRecoveryScenario,
  searchDesign,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function manufacturingPlan() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") throw new Error("fixture");
  const search = searchDesign(compiled.value);
  assert.ok(search.winner);
  const plan = planCandidateManufacturing(
    compiled.value,
    search.winner.candidate,
  );
  compileMotionProgram(plan);
  return plan;
}

test("five recovery case studies share one observation/diagnosis/action/verification runtime", async () => {
  const plan = manufacturingPlan();
  const files = (await readdir("examples/recovery"))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(files, [
    "01-bore-tool-wear-drift.json",
    "02-clamp-distortion.json",
    "03-chatter-stickout.json",
    "04-gage-rr-failure.json",
    "05-thermal-drift.json",
  ]);

  const studies = [];
  for (const file of files) {
    const input = JSON.parse(
      await readFile("examples/recovery/" + file, "utf8"),
    ) as unknown;
    studies.push(runProcessRecoveryScenario(plan, input));
  }

  assert.deepEqual(
    studies.map((study) => study.assessment.diagnosis),
    [
      "tool-wear-drift",
      "clamp-induced-distortion",
      "chatter-excessive-stickout",
      "measurement-system-inadequate",
      "thermal-drift",
    ],
  );
  assert.deepEqual(
    studies.map((study) => study.application.action._tag),
    [
      "AdjustToolDiameter",
      "SetClampForceScale",
      "SetToolStickout",
      "QuarantineMeasurementSystem",
      "ApplyThermalWorkOffset",
    ],
  );
  assert.deepEqual(
    studies.map((study) => study.verification.disposition),
    [
      "restored",
      "restored",
      "restored",
      "measurement-system-restored",
      "restored",
    ],
  );

  const toolWear = studies[0]!;
  assert.equal(toolWear.application.action._tag, "AdjustToolDiameter");
  if (toolWear.application.action._tag === "AdjustToolDiameter") {
    assert.equal(toolWear.application.action.toolId, "T3.finish-bore");
    assert.equal(toolWear.application.action.deltaMm, 0.006);
  }

  const clamp = studies[1]!;
  assert.ok(
    clamp.observations.some(
      (observation) =>
        observation.kind === "human-correction" &&
        observation.source.kind === "human",
    ),
  );
  assert.equal(clamp.application.after.clampForceScale, 0.72);

  const chatter = studies[2]!;
  const profileTool = chatter.application.after.toolAdjustments.find(
    (item) => item.toolId === "T4.profile",
  );
  assert.equal(profileTool?.stickoutMm, 28);

  const gage = studies[3]!;
  assert.equal(gage.application.after.processHold, true);
  assert.equal(
    gage.application.after.measurementSystems.find(
      (item) => item.systemId === "bore-gage-cmm",
    )?.disposition,
    "quarantined",
  );

  const thermal = studies[4]!;
  assert.equal(
    thermal.application.after.thermalWorkOffsetMm.x,
    -0.043,
  );

  for (const study of studies) {
    assert.ok(study.caseStudyDigest.startsWith("sha256:"));
    assert.ok(study.assessment.assessmentDigest.startsWith("sha256:"));
    assert.ok(study.verification.verificationDigest.startsWith("sha256:"));
  }
});

test("human corrections cannot bypass the observation compiler", () => {
  const result = compileProcessObservation({
    schema: "gmr.process-observation/v1",
    id: "BAD-HUMAN-CORRECTION",
    source: {
      kind: "machine-feedback",
      systemId: "controller",
      channel: "metadata",
    },
    kind: "human-correction",
    field: "tool-stickout-mm",
    toolId: "T4.profile",
    previousValue: 30,
    correctedValue: 42,
    reason: "not actually human evidence",
  });
  assert.equal(result._tag, "CompileError");
  if (result._tag === "CompileError") {
    assert.equal(result.code, "invalid-human-correction");
  }
});

test("quarantined measurement systems block process compensation", () => {
  const plan = manufacturingPlan();
  const state = createProcessControlState(plan);
  const failedGage = compileProcessObservation({
    schema: "gmr.process-observation/v1",
    id: "GRR-BLOCK",
    source: {
      kind: "metrology",
      systemId: "bore-gage-cmm",
      method: "gage-rr",
    },
    kind: "gage-rr",
    measurementSystemId: "bore-gage-cmm",
    percentGrr: 35,
    ndc: 3,
    repeatabilityMm: 0.005,
    reproducibilityMm: 0.004,
  });
  assert.equal(failedGage._tag, "Compiled");
  if (failedGage._tag !== "Compiled") return;
  const assessment = assessProcessException(plan, state, [failedGage.value]);
  assert.equal(assessment.recommendedActionId, "REC-QUARANTINE-GAGE");
  const quarantine = applyRecoveryAction(
    state,
    assessment,
    "REC-QUARANTINE-GAGE",
  );

  const trend = compileProcessObservation({
    schema: "gmr.process-observation/v1",
    id: "TREND-WITH-BAD-GAGE",
    source: {
      kind: "metrology",
      systemId: "bore-gage-cmm",
      method: "bore-gage",
    },
    kind: "dimensional-trend",
    characteristicId: "IC-PAYLOAD-BORE-SIZE",
    valuesMm: [16.008, 16.006, 16.004, 16.002],
    lowerLimitMm: 16,
    upperLimitMm: 16.018,
    measurementSystemId: "bore-gage-cmm",
  });
  assert.equal(trend._tag, "Compiled");
  if (trend._tag !== "Compiled") return;
  const blocked = assessProcessException(
    plan,
    quarantine.after,
    [trend.value],
  );
  assert.equal(blocked.diagnosis, "measurement-system-inadequate");
  assert.equal(blocked.evidenceQuality, "measurement-system-untrusted");
  assert.ok(
    blocked.allowedActions.every(
      (action) => action._tag !== "AdjustToolDiameter",
    ),
  );
});

test("committed recovery case-study docs are generated from the executable scenarios", async () => {
  const plan = manufacturingPlan();
  const files = (await readdir("examples/recovery"))
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const file of files) {
    const input = JSON.parse(
      await readFile("examples/recovery/" + file, "utf8"),
    ) as unknown;
    const study = runProcessRecoveryScenario(plan, input);
    const expected = renderRecoveryCaseStudyMarkdown(study);
    const actual = await readFile(
      "docs/case-studies/" + study.scenarioId + ".md",
      "utf8",
    );
    assert.equal(actual, expected, study.scenarioId);
  }
});
