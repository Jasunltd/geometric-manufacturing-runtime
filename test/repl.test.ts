import assert from "node:assert/strict";
import test from "node:test";
import {
  GeometricManufacturingReplSession,
  parseReplLine,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

test("REPL rejects arbitrary code and natural-language execution", () => {
  assert.throws(
    () => parseReplLine("globalThis.compromised = true"),
    /closed function-call syntax/,
  );
  assert.throws(
    () => parseReplLine("design me a bracket"),
    /closed function-call syntax/,
  );
  assert.throws(
    () => parseReplLine("eval(1)"),
    /unsupported REPL command/,
  );
});

test("REPL traverses action search, FEA, CAM, motion, and target posting", () => {
  const session = new GeometricManufacturingReplSession();

  const problem = session.evaluate(
    "problem(" + JSON.stringify(designProblemInput) + ")",
  );
  assert.equal(problem.kind, "problem");
  if (problem.kind === "problem") {
    assert.equal(problem.result._tag, "Compiled");
  }

  const search = session.evaluate("search()");
  assert.equal(search.kind, "search");
  if (search.kind === "search") {
    assert.equal(search.search.disposition, "winner-found");
    assert.equal(search.search.winner?.candidate.id, "candidate-0046");
  }

  const inspected = session.evaluate("inspect()");
  assert.equal(inspected.kind, "inspection");
  if (inspected.kind === "inspection") {
    assert.equal(inspected.candidate?.id, "candidate-0046");
  }

  const baseline = session.evaluate("synthesize()");
  assert.equal(baseline.kind, "synthesis");
  if (baseline.kind === "synthesis") {
    assert.equal(
      baseline.synthesis.selectedCandidateId,
      "candidate-0046",
    );
  }

  const candidates = session.evaluate("candidates(3)");
  assert.equal(candidates.kind, "candidates");
  if (candidates.kind === "candidates") {
    assert.equal(candidates.candidates.length, 3);
  }

  const fea = session.evaluate("fea()");
  assert.equal(fea.kind, "fea");

  const cam = session.evaluate("cam()");
  assert.equal(cam.kind, "cam");

  const motion = session.evaluate("motion()");
  assert.equal(motion.kind, "motion");

  const haas = session.evaluate('post("haas-ngc")');
  assert.equal(haas.kind, "post");
  if (haas.kind === "post") {
    assert.equal(haas.program.target, "haas-ngc");
    assert.match(haas.program.text, /O01001/);
  }

  const status = session.evaluate("status()");
  assert.equal(status.kind, "status");
  if (status.kind === "status") {
    assert.ok(status.problemDigest?.startsWith("sha256:"));
    assert.ok(status.searchDigest?.startsWith("sha256:"));
    assert.ok(status.synthesisDigest?.startsWith("sha256:"));
    assert.ok(status.lastControllerArtifactDigest?.startsWith("sha256:"));
  }
});