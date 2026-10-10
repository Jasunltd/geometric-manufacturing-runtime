import assert from "node:assert/strict";
import test from "node:test";
import {
  compileDesignProblem,
  synthesizeDesignSpace,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

test("DesignProblem is the trusted boundary, not natural language", () => {
  const rejected = compileDesignProblem(
    "design a lightweight aluminum sensor bracket",
  );
  assert.equal(rejected._tag, "CompileError");

  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
});

test("deterministic grammar search produces feasible parametric candidates", () => {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") return;

  const first = synthesizeDesignSpace(compiled.value);
  const second = synthesizeDesignSpace(compiled.value);
  assert.equal(first.synthesisDigest, second.synthesisDigest);
  assert.equal(first.candidates.length, 900);
  assert.equal(first.feasibleCandidates.length, 675);

  const selected = first.feasibleCandidates[0];
  assert.ok(selected);
  assert.equal(selected.id, first.selectedCandidateId);
  assert.ok(
    selected.metrics.screeningTipDeflectionMm <=
      compiled.value.requirements.maxTipDeflectionMm,
  );
  assert.ok(
    selected.metrics.screeningStaticFactorOfSafety >=
      compiled.value.requirements.minStaticFactorOfSafety,
  );
  for (const candidate of first.feasibleCandidates) {
    assert.ok(selected.metrics.massG <= candidate.metrics.massG + 1e-9);
  }
});

test("root-buttress grammar is optional and malformed topology ranges fail compilation", () => {
  const {
    rootButtressLengthMm: _removed,
    ...baseGrammar
  } = designProblemInput.grammar;
  const withoutTopology = compileDesignProblem({
    ...designProblemInput,
    grammar: baseGrammar,
  });
  assert.equal(withoutTopology._tag, "Compiled");
  if (withoutTopology._tag === "Compiled") {
    const baseline = synthesizeDesignSpace(withoutTopology.value);
    assert.equal(baseline.candidates.length, 180);
    assert.equal(baseline.feasibleCandidates.length, 135);
  }

  const malformed = compileDesignProblem({
    ...designProblemInput,
    grammar: {
      ...designProblemInput.grammar,
      rootButtressLengthMm: { min: 20, max: 8, step: 4 },
    },
  });
  assert.equal(malformed._tag, "CompileError");
  if (malformed._tag === "CompileError") {
    assert.equal(malformed.code, "invalid-range");
  }
});
