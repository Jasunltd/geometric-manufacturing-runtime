import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDesignAction,
  compileDesignProblem,
  compileStructuralStudyRequest,
  enumerateDesignActions,
  evaluateDesignState,
  planCandidateManufacturing,
  searchDesign,
  synthesizeDesignSpace,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function problem() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") {
    throw new Error("fixture failed");
  }
  return compiled.value;
}

function topologyProbeProblem() {
  const input = {
    ...designProblemInput,
    id: "sensor-bracket-topology-probe",
    requirements: {
      ...designProblemInput.requirements,
      maxTipDeflectionMm: 0.145,
    },
    grammar: {
      ...designProblemInput.grammar,
      thicknessMm: { min: 6, max: 6, step: 2 },
      rootHalfWidthMm: { min: 24, max: 24, step: 3 },
      armHalfWidthMm: { min: 14, max: 14, step: 2 },
      tipHalfWidthMm: { min: 14, max: 14, step: 2 },
    },
  };
  const compiled = compileDesignProblem(input);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") {
    throw new Error("topology fixture failed");
  }
  return compiled.value;
}

test("state-conditioned action mask exposes only moves that address current violations", () => {
  const designProblem = problem();
  const initial = evaluateDesignState(designProblem, {
    thicknessMm: 6,
    rootHalfWidthMm: 24,
    armHalfWidthMm: 14,
    tipHalfWidthMm: 14,
  });
  assert.equal(initial._tag, "Evaluated");
  if (initial._tag !== "Evaluated") return;

  assert.equal(initial.state.candidate.disposition, "rejected");
  assert.ok(
    initial.state.candidate.violations.some(
      (violation) => violation.code === "deflection",
    ),
  );

  const actions = enumerateDesignActions(designProblem, initial.state);
  assert.ok(actions.length > 0);
  assert.ok(
    actions.every((action) => action.addresses.includes("deflection")),
  );
  assert.ok(
    actions.some((action) => action._tag === "IncreaseThickness"),
  );
  assert.ok(
    actions.some((action) => action._tag === "WidenRoot"),
  );
  assert.ok(
    actions.some((action) => action._tag === "AddRootButtress"),
  );
  assert.ok(
    actions.every(
      (action) =>
        action._tag !== "DecreaseThickness" &&
        action._tag !== "NarrowRoot" &&
        action._tag !== "NarrowArm" &&
        action._tag !== "NarrowTip",
    ),
  );
});

test("action application is bound to the exact current state", () => {
  const designProblem = problem();
  const initial = evaluateDesignState(designProblem, {
    thicknessMm: 6,
    rootHalfWidthMm: 24,
    armHalfWidthMm: 14,
    tipHalfWidthMm: 14,
  });
  assert.equal(initial._tag, "Evaluated");
  if (initial._tag !== "Evaluated") return;
  const action = enumerateDesignActions(
    designProblem,
    initial.state,
  ).find((candidate) => candidate._tag === "IncreaseThickness");
  assert.ok(action);

  const applied = applyDesignAction(
    designProblem,
    initial.state,
    action,
  );
  assert.equal(applied._tag, "Applied");
  if (applied._tag !== "Applied") return;
  assert.equal(applied.state.candidate.id, "candidate-0046");
  assert.equal(applied.state.construction.parameters.thicknessMm, 8);

  const forged = {
    ...action,
    toMm: 12,
  };
  const refused = applyDesignAction(
    designProblem,
    initial.state,
    forged,
  );
  assert.equal(refused._tag, "Refused");
  if (refused._tag === "Refused") {
    assert.equal(refused.code, "action-not-admissible");
  }
});

test("bounded action search reproduces the topology-aware exhaustive winner", () => {
  const designProblem = problem();
  const first = searchDesign(designProblem);
  const second = searchDesign(designProblem);
  const exhaustive = synthesizeDesignSpace(designProblem);

  assert.equal(first.searchDigest, second.searchDigest);
  assert.equal(first.disposition, "winner-found");
  assert.ok(first.winner);
  assert.equal(first.winner.candidate.id, exhaustive.selectedCandidateId);
  assert.equal(first.winner.candidate.id, "candidate-0046");
  assert.equal(first.winner.candidate.disposition, "feasible");
  assert.ok(first.expandedStateCount < exhaustive.candidates.length);
  assert.ok(first.generatedStateCount < exhaustive.candidates.length);
  assert.ok(first.edges.length > 0);
  assert.equal(first.winningPath.length, 1);
  assert.equal(
    first.winningPath[0]?.action._tag,
    "IncreaseThickness",
  );
  assert.ok(
    first.edges.some(
      (edge) => edge.action._tag === "AddRootButtress",
    ),
  );
  assert.equal(
    first.states.find(
      (state) => state.stateDigest === first.initialStateDigest,
    )?.candidate.disposition,
    "rejected",
  );
});

test("root-buttress topology can be the only feasible action path", () => {
  const designProblem = topologyProbeProblem();
  const search = searchDesign(designProblem, {
    maxExpandedStates: 32,
  });
  const exhaustive = synthesizeDesignSpace(designProblem);

  assert.equal(search.disposition, "winner-found");
  assert.ok(search.winner);
  assert.equal(search.winner.candidate.id, exhaustive.selectedCandidateId);
  assert.equal(
    search.winner.candidate.family,
    "root-buttressed-plate-arm",
  );
  assert.deepEqual(
    search.winningPath.map((edge) => edge.action._tag),
    ["AddRootButtress", "ExtendRootButtress"],
  );
  assert.equal(search.winner.candidate.rootButtress?.lengthMm, 12);
  assert.equal(search.winner.candidate.profile.length, 5);

  const initial = search.states.find(
    (state) => state.stateDigest === search.initialStateDigest,
  );
  assert.ok(initial);
  assert.ok(
    search.winner.candidate.metrics.screeningTipDeflectionMm <
      initial.candidate.metrics.screeningTipDeflectionMm,
  );
  assert.ok(
    search.winner.candidate.metrics.massG >
      initial.candidate.metrics.massG,
  );

  const structural = compileStructuralStudyRequest(
    designProblem,
    search.winner.candidate,
  );
  assert.equal(structural._tag, "Compiled");
  if (structural._tag === "Compiled") {
    assert.equal(structural.request.geometry.halfWidthProfile.length, 5);
  }

  const manufacturing = planCandidateManufacturing(
    designProblem,
    search.winner.candidate,
  );
  const contour = manufacturing.setups[0]?.operations.find(
    (operation) => operation._tag === "ProfileContour",
  );
  assert.ok(contour);
  if (contour?._tag === "ProfileContour") {
    assert.equal(contour.contour.length, 11);
  }
});

test("mass pressure admits shortening/removing an existing buttress", () => {
  const compiled = compileDesignProblem({
    ...designProblemInput,
    id: "sensor-bracket-buttress-removal-probe",
    requirements: {
      ...designProblemInput.requirements,
      maxTipDeflectionMm: 1,
      maxMassG: 48,
    },
  });
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") return;

  const state = evaluateDesignState(compiled.value, {
    family: "root-buttressed-plate-arm",
    parameters: {
      thicknessMm: 6,
      rootHalfWidthMm: 24,
      armHalfWidthMm: 14,
      tipHalfWidthMm: 14,
    },
    rootButtress: { lengthMm: 12 },
  });
  assert.equal(state._tag, "Evaluated");
  if (state._tag !== "Evaluated") return;
  assert.ok(
    state.state.candidate.violations.some(
      (violation) => violation.code === "mass",
    ),
  );

  const actions = enumerateDesignActions(compiled.value, state.state);
  assert.ok(
    actions.some((action) => action._tag === "ShortenRootButtress"),
  );
  const remove = actions.find(
    (action) => action._tag === "RemoveRootButtress",
  );
  assert.ok(remove);

  const applied = applyDesignAction(
    compiled.value,
    state.state,
    remove,
  );
  assert.equal(applied._tag, "Applied");
  if (applied._tag === "Applied") {
    assert.equal(
      applied.state.construction.family,
      "tapered-plate-arm",
    );
    assert.equal(applied.state.candidate.disposition, "feasible");
  }
});

test("search budget is an explicit stop condition", () => {
  const result = searchDesign(problem(), { maxExpandedStates: 1 });
  assert.equal(result.disposition, "budget-exhausted");
  assert.equal(result.expandedStateCount, 1);
  assert.equal(result.winner, undefined);
});