import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import type {
  CandidateViolationCode,
  DesignCandidate,
  DesignProblem,
  RootButtressParameters,
  TaperedPlateArmParameters,
} from "./model.js";
import {
  evaluatePlateArmCandidate,
  validateRootButtressParameters,
  validateTaperedPlateArmParameters,
} from "./evaluate.js";

export type DesignConstructionInput =
  | {
      readonly family: "tapered-plate-arm";
      readonly parameters: TaperedPlateArmParameters;
    }
  | {
      readonly family: "root-buttressed-plate-arm";
      readonly parameters: TaperedPlateArmParameters;
      readonly rootButtress: RootButtressParameters;
    };

export type DesignConstruction =
  | (Extract<
      DesignConstructionInput,
      { readonly family: "tapered-plate-arm" }
    > & {
      readonly schema: "gmr.design-construction/v1";
      readonly constructionDigest: Digest;
    })
  | (Extract<
      DesignConstructionInput,
      { readonly family: "root-buttressed-plate-arm" }
    > & {
      readonly schema: "gmr.design-construction/v1";
      readonly constructionDigest: Digest;
    });

export interface DesignObligation {
  readonly code: CandidateViolationCode;
  readonly status: "satisfied" | "violated";
  readonly detail: string;
}

export interface DesignState {
  readonly schema: "gmr.design-state/v1";
  readonly problemDigest: Digest;
  readonly construction: DesignConstruction;
  readonly candidate: DesignCandidate;
  readonly obligations: readonly DesignObligation[];
  readonly stateDigest: Digest;
}

export type DesignStateEvaluation =
  | {
      readonly _tag: "Evaluated";
      readonly state: DesignState;
    }
  | {
      readonly _tag: "Refused";
      readonly code: "outside-declared-grammar";
      readonly detail: string;
    };

function declaredObligationCodes(
  problem: DesignProblem,
): readonly CandidateViolationCode[] {
  return [
    "envelope-x",
    "envelope-y",
    "envelope-z",
    "hole-edge-distance",
    "deflection",
    "factor-of-safety",
    ...(problem.requirements.maxMassG === undefined
      ? []
      : (["mass"] as const)),
    "setup-limit",
  ];
}

function obligations(
  problem: DesignProblem,
  candidate: DesignCandidate,
): readonly DesignObligation[] {
  const violated = new Map(
    candidate.violations.map((violation) => [
      violation.code,
      violation.detail,
    ]),
  );
  return declaredObligationCodes(problem).map((code) => {
    const detail = violated.get(code);
    return detail === undefined
      ? {
          code,
          status: "satisfied" as const,
          detail: "screening obligation satisfied",
        }
      : {
          code,
          status: "violated" as const,
          detail,
        };
  });
}

function isConstructionInput(
  input: TaperedPlateArmParameters | DesignConstructionInput,
): input is DesignConstructionInput {
  return "family" in input;
}

function normalizeConstructionInput(
  input: TaperedPlateArmParameters | DesignConstructionInput,
): DesignConstructionInput {
  return isConstructionInput(input)
    ? input
    : {
        family: "tapered-plate-arm",
        parameters: input,
      };
}

export function evaluateDesignState(
  problem: DesignProblem,
  input: TaperedPlateArmParameters | DesignConstructionInput,
): DesignStateEvaluation {
  const constructionInput = normalizeConstructionInput(input);
  const invalid = validateTaperedPlateArmParameters(
    problem,
    constructionInput.parameters,
  );
  if (invalid !== undefined) {
    return {
      _tag: "Refused",
      code: "outside-declared-grammar",
      detail: invalid,
    };
  }

  if (constructionInput.family === "root-buttressed-plate-arm") {
    const topologyInvalid = validateRootButtressParameters(
      problem,
      constructionInput.rootButtress,
    );
    if (topologyInvalid !== undefined) {
      return {
        _tag: "Refused",
        code: "outside-declared-grammar",
        detail: topologyInvalid,
      };
    }
  }

  const candidate = evaluatePlateArmCandidate(
    problem,
    constructionInput.parameters,
    constructionInput.family === "root-buttressed-plate-arm"
      ? constructionInput.rootButtress
      : undefined,
  );
  const constructionBase = {
    schema: "gmr.design-construction/v1" as const,
    ...constructionInput,
  };
  const construction = {
    ...constructionBase,
    constructionDigest: semanticDigest(constructionBase),
  } as DesignConstruction;
  const stateBase = {
    schema: "gmr.design-state/v1" as const,
    problemDigest: candidate.problemDigest,
    construction,
    candidate,
    obligations: obligations(problem, candidate),
  };
  return {
    _tag: "Evaluated",
    state: {
      ...stateBase,
      stateDigest: semanticDigest(stateBase),
    },
  };
}
