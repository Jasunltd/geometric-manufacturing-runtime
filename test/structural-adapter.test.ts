
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bindExistingFixtureStudyResult,
  bindExistingFixtureStudyToolchain,
  compileDesignProblem,
  compileStructuralStudyRequest,
  synthesizeDesignSpace,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function structuralFlow() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") {
    throw new Error("fixture failed");
  }
  const synthesis = synthesizeDesignSpace(compiled.value);
  const selected = synthesis.feasibleCandidates[0];
  assert.ok(selected);
  const structural = compileStructuralStudyRequest(
    compiled.value,
    selected,
  );
  assert.equal(structural._tag, "Compiled");
  if (structural._tag !== "Compiled") {
    throw new Error("structural fixture failed");
  }
  return {
    problem: compiled.value,
    selected,
    request: structural.request,
  };
}

test("selected candidate compiles to the existing structural-study schema", () => {
  const { selected, request } = structuralFlow();

  assert.equal(request.candidateDigest, selected.candidateDigest);
  assert.equal(
    request.geometry.thicknessMm,
    selected.parameters.thicknessMm,
  );
  assert.equal(request.geometry.holes.length, 3);

  const config = bindExistingFixtureStudyToolchain(request, {
    gmsh: "gmsh",
    calculix: "ccx",
  });
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.toolchain.gmsh, "gmsh");
  assert.equal(config.toolchain.calculix, "ccx");
});

test("structural request refuses a candidate from a different DesignProblem", () => {
  const original = structuralFlow();
  const changed = compileDesignProblem({
    ...designProblemInput,
    requirements: {
      ...designProblemInput.requirements,
      maxTipDeflectionMm: 0.07,
    },
  });
  assert.equal(changed._tag, "Compiled");
  if (changed._tag !== "Compiled") return;
  const result = compileStructuralStudyRequest(
    changed.value,
    original.selected,
  );
  assert.equal(result._tag, "CompileError");
  if (result._tag === "CompileError") {
    assert.equal(result.code, "candidate-problem-mismatch");
  }
});

test("recorded Gmsh/CalculiX result binds to the exact generated candidate", async () => {
  const { problem, selected, request } = structuralFlow();
  const recorded = JSON.parse(
    await readFile(
      "examples/sensor-bracket.structural-analysis.recorded.json",
      "utf8",
    ),
  ) as unknown;

  const binding = bindExistingFixtureStudyResult(
    problem,
    request,
    recorded,
  );
  assert.equal(binding._tag, "Compiled");
  if (binding._tag !== "Compiled") return;

  assert.equal(binding.value.candidateDigest, selected.candidateDigest);
  assert.equal(
    binding.value.disposition,
    "supports-screening-requirements",
  );
  assert.ok(
    Math.abs(
      binding.value.observations.loadAverageDisplacementMm -
        0.06319071177083331,
    ) < 1e-12,
  );
  assert.ok(
    binding.value.observations.staticFactorOfSafetyAgainstDeclaredYield >
      problem.requirements.minStaticFactorOfSafety,
  );
});

test("structural result with a different geometry digest fails closed", async () => {
  const { problem, request } = structuralFlow();
  const recorded = JSON.parse(
    await readFile(
      "examples/sensor-bracket.structural-analysis.recorded.json",
      "utf8",
    ),
  ) as Record<string, unknown>;
  const tampered = {
    ...recorded,
    geometryDigest: "sha256:" + "0".repeat(64),
  };

  const binding = bindExistingFixtureStudyResult(
    problem,
    request,
    tampered,
  );
  assert.equal(binding._tag, "CompileError");
  if (binding._tag === "CompileError") {
    assert.equal(
      binding.code,
      "structural-geometry-digest-mismatch",
    );
  }
});

test("keepouts fail closed until the existing FEA schema can represent them", () => {
  const withKeepout = {
    ...designProblemInput,
    keepOuts: [
      {
        kind: "circle-through" as const,
        id: "cable-clearance",
        center: { x: 45, y: 0 },
        diameterMm: 4,
      },
    ],
  };
  const compiled = compileDesignProblem(withKeepout);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") return;
  const synthesis = synthesizeDesignSpace(compiled.value);
  const selected = synthesis.feasibleCandidates[0];
  assert.ok(selected);
  const structural = compileStructuralStudyRequest(
    compiled.value,
    selected,
  );
  assert.equal(structural._tag, "Unsupported");
});
