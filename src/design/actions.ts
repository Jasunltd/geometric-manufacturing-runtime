import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import type {
  CandidateViolationCode,
  DesignProblem,
  NumericRange,
  RootButtressParameters,
  TaperedPlateArmParameters,
} from "./model.js";
import {
  parameterValues,
  validateRootButtressParameters,
  validateTaperedPlateArmParameters,
} from "./evaluate.js";
import {
  evaluateDesignState,
  type DesignConstructionInput,
  type DesignState,
} from "./state.js";

interface DesignActionCommon {
  readonly addresses: readonly CandidateViolationCode[];
  readonly actionDigest: Digest;
}

interface NumericDesignActionBase extends DesignActionCommon {
  readonly fromMm: number;
  readonly toMm: number;
}

export type DesignAction =
  | (NumericDesignActionBase & { readonly _tag: "IncreaseThickness" })
  | (NumericDesignActionBase & { readonly _tag: "DecreaseThickness" })
  | (NumericDesignActionBase & { readonly _tag: "WidenRoot" })
  | (NumericDesignActionBase & { readonly _tag: "NarrowRoot" })
  | (NumericDesignActionBase & { readonly _tag: "WidenArm" })
  | (NumericDesignActionBase & { readonly _tag: "NarrowArm" })
  | (NumericDesignActionBase & { readonly _tag: "WidenTip" })
  | (NumericDesignActionBase & { readonly _tag: "NarrowTip" })
  | (DesignActionCommon & {
      readonly _tag: "AddRootButtress";
      readonly lengthMm: number;
    })
  | (NumericDesignActionBase & {
      readonly _tag: "ExtendRootButtress";
    })
  | (NumericDesignActionBase & {
      readonly _tag: "ShortenRootButtress";
    })
  | (DesignActionCommon & {
      readonly _tag: "RemoveRootButtress";
      readonly lengthMm: number;
    });

export type DesignActionApplication =
  | {
      readonly _tag: "Applied";
      readonly action: DesignAction;
      readonly state: DesignState;
    }
  | {
      readonly _tag: "Refused";
      readonly code:
        | "problem-state-mismatch"
        | "action-not-admissible"
        | "action-produced-invalid-construction";
      readonly detail: string;
    };

function adjacent(
  range: NumericRange,
  current: number,
  direction: -1 | 1,
): number | undefined {
  const values = parameterValues(range);
  const index = values.findIndex((value) => Math.abs(value - current) <= 1e-9);
  if (index < 0) return undefined;
  return values[index + direction];
}

function parameterActionConstruction(
  state: DesignState,
  tag:
    | "IncreaseThickness"
    | "DecreaseThickness"
    | "WidenRoot"
    | "NarrowRoot"
    | "WidenArm"
    | "NarrowArm"
    | "WidenTip"
    | "NarrowTip",
  toMm: number,
): DesignConstructionInput {
  const parameters: TaperedPlateArmParameters = (() => {
    switch (tag) {
      case "IncreaseThickness":
      case "DecreaseThickness":
        return { ...state.construction.parameters, thicknessMm: toMm };
      case "WidenRoot":
      case "NarrowRoot":
        return { ...state.construction.parameters, rootHalfWidthMm: toMm };
      case "WidenArm":
      case "NarrowArm":
        return { ...state.construction.parameters, armHalfWidthMm: toMm };
      case "WidenTip":
      case "NarrowTip":
        return { ...state.construction.parameters, tipHalfWidthMm: toMm };
    }
  })();

  return state.construction.family === "root-buttressed-plate-arm"
    ? {
        family: "root-buttressed-plate-arm",
        parameters,
        rootButtress: state.construction.rootButtress,
      }
    : {
        family: "tapered-plate-arm",
        parameters,
      };
}

function topologyActionConstruction(
  state: DesignState,
  action:
    | Extract<DesignAction, { readonly _tag: "AddRootButtress" }>
    | Extract<DesignAction, { readonly _tag: "ExtendRootButtress" }>
    | Extract<DesignAction, { readonly _tag: "ShortenRootButtress" }>
    | Extract<DesignAction, { readonly _tag: "RemoveRootButtress" }>,
): DesignConstructionInput {
  switch (action._tag) {
    case "AddRootButtress":
      return {
        family: "root-buttressed-plate-arm",
        parameters: state.construction.parameters,
        rootButtress: { lengthMm: action.lengthMm },
      };
    case "ExtendRootButtress":
    case "ShortenRootButtress":
      return {
        family: "root-buttressed-plate-arm",
        parameters: state.construction.parameters,
        rootButtress: { lengthMm: action.toMm },
      };
    case "RemoveRootButtress":
      return {
        family: "tapered-plate-arm",
        parameters: state.construction.parameters,
      };
  }
}

function constructionAfter(
  state: DesignState,
  action: DesignAction,
): DesignConstructionInput {
  switch (action._tag) {
    case "IncreaseThickness":
    case "DecreaseThickness":
    case "WidenRoot":
    case "NarrowRoot":
    case "WidenArm":
    case "NarrowArm":
    case "WidenTip":
    case "NarrowTip":
      return parameterActionConstruction(state, action._tag, action.toMm);
    case "AddRootButtress":
    case "ExtendRootButtress":
    case "ShortenRootButtress":
    case "RemoveRootButtress":
      return topologyActionConstruction(state, action);
  }
}

type DesignActionSpec = DesignAction extends infer Action
  ? Action extends { readonly actionDigest: Digest }
    ? Omit<Action, "actionDigest">
    : never
  : never;

function buildAction(
  state: DesignState,
  base: DesignActionSpec,
): DesignAction {
  return {
    ...base,
    actionDigest: semanticDigest({
      stateDigest: state.stateDigest,
      ...base,
    }),
  } as unknown as DesignAction;
}

function validConstruction(
  problem: DesignProblem,
  construction: DesignConstructionInput,
): boolean {
  if (
    validateTaperedPlateArmParameters(
      problem,
      construction.parameters,
    ) !== undefined
  ) {
    return false;
  }
  return (
    construction.family !== "root-buttressed-plate-arm" ||
    validateRootButtressParameters(
      problem,
      construction.rootButtress,
    ) === undefined
  );
}

export function enumerateDesignActions(
  problem: DesignProblem,
  state: DesignState,
): readonly DesignAction[] {
  if (state.problemDigest !== semanticDigest(problem)) return [];

  const violations = new Set(
    state.obligations
      .filter((obligation) => obligation.status === "violated")
      .map((obligation) => obligation.code),
  );
  if (violations.size === 0) return [];

  const parameters = state.construction.parameters;
  const actions: DesignAction[] = [];

  const addNumeric = (
    tag:
      | "IncreaseThickness"
      | "DecreaseThickness"
      | "WidenRoot"
      | "NarrowRoot"
      | "WidenArm"
      | "NarrowArm"
      | "WidenTip"
      | "NarrowTip",
    fromMm: number,
    toMm: number | undefined,
    potential: readonly CandidateViolationCode[],
  ) => {
    if (toMm === undefined) return;
    const addresses = potential.filter((code) => violations.has(code));
    if (addresses.length === 0) return;
    const construction = parameterActionConstruction(state, tag, toMm);
    if (!validConstruction(problem, construction)) return;
    actions.push(
      buildAction(state, { _tag: tag, fromMm, toMm, addresses }),
    );
  };

  const strengthening = ["deflection", "factor-of-safety"] as const;
  const widening = [
    "deflection",
    "factor-of-safety",
    "hole-edge-distance",
  ] as const;
  const thinning = ["mass", "envelope-z"] as const;
  const narrowing = ["mass", "envelope-y"] as const;

  addNumeric(
    "IncreaseThickness",
    parameters.thicknessMm,
    adjacent(problem.grammar.thicknessMm, parameters.thicknessMm, 1),
    strengthening,
  );
  addNumeric(
    "WidenRoot",
    parameters.rootHalfWidthMm,
    adjacent(
      problem.grammar.rootHalfWidthMm,
      parameters.rootHalfWidthMm,
      1,
    ),
    widening,
  );
  addNumeric(
    "WidenArm",
    parameters.armHalfWidthMm,
    adjacent(
      problem.grammar.armHalfWidthMm,
      parameters.armHalfWidthMm,
      1,
    ),
    widening,
  );
  addNumeric(
    "WidenTip",
    parameters.tipHalfWidthMm,
    adjacent(
      problem.grammar.tipHalfWidthMm,
      parameters.tipHalfWidthMm,
      1,
    ),
    widening,
  );
  addNumeric(
    "DecreaseThickness",
    parameters.thicknessMm,
    adjacent(problem.grammar.thicknessMm, parameters.thicknessMm, -1),
    thinning,
  );
  addNumeric(
    "NarrowRoot",
    parameters.rootHalfWidthMm,
    adjacent(
      problem.grammar.rootHalfWidthMm,
      parameters.rootHalfWidthMm,
      -1,
    ),
    narrowing,
  );
  addNumeric(
    "NarrowArm",
    parameters.armHalfWidthMm,
    adjacent(
      problem.grammar.armHalfWidthMm,
      parameters.armHalfWidthMm,
      -1,
    ),
    narrowing,
  );
  addNumeric(
    "NarrowTip",
    parameters.tipHalfWidthMm,
    adjacent(
      problem.grammar.tipHalfWidthMm,
      parameters.tipHalfWidthMm,
      -1,
    ),
    narrowing,
  );

  const buttressRange = problem.grammar.rootButtressLengthMm;
  if (buttressRange !== undefined) {
    if (state.construction.family === "tapered-plate-arm") {
      const addresses = strengthening.filter((code) => violations.has(code));
      if (addresses.length > 0) {
        const buttress: RootButtressParameters = {
          lengthMm: buttressRange.min,
        };
        if (validateRootButtressParameters(problem, buttress) === undefined) {
          actions.push(
            buildAction(state, {
              _tag: "AddRootButtress",
              lengthMm: buttress.lengthMm,
              addresses,
            }),
          );
        }
      }
    } else {
      const current = state.construction.rootButtress.lengthMm;
      const longer = adjacent(buttressRange, current, 1);
      const shorter = adjacent(buttressRange, current, -1);
      const strengthenAddresses = strengthening.filter((code) =>
        violations.has(code),
      );
      const massAddresses = (["mass"] as const).filter((code) =>
        violations.has(code),
      );

      if (longer !== undefined && strengthenAddresses.length > 0) {
        const construction: DesignConstructionInput = {
          family: "root-buttressed-plate-arm",
          parameters,
          rootButtress: { lengthMm: longer },
        };
        if (validConstruction(problem, construction)) {
          actions.push(
            buildAction(state, {
              _tag: "ExtendRootButtress",
              fromMm: current,
              toMm: longer,
              addresses: strengthenAddresses,
            }),
          );
        }
      }

      if (shorter !== undefined && massAddresses.length > 0) {
        actions.push(
          buildAction(state, {
            _tag: "ShortenRootButtress",
            fromMm: current,
            toMm: shorter,
            addresses: massAddresses,
          }),
        );
      }
      if (massAddresses.length > 0) {
        actions.push(
          buildAction(state, {
            _tag: "RemoveRootButtress",
            lengthMm: current,
            addresses: massAddresses,
          }),
        );
      }
    }
  }

  return actions;
}

export function applyDesignAction(
  problem: DesignProblem,
  state: DesignState,
  action: DesignAction,
): DesignActionApplication {
  if (state.problemDigest !== semanticDigest(problem)) {
    return {
      _tag: "Refused",
      code: "problem-state-mismatch",
      detail: "state belongs to a different DesignProblem identity",
    };
  }
  const { actionDigest, ...claimed } = action;
  const expectedDigest = semanticDigest({
    stateDigest: state.stateDigest,
    ...claimed,
  });
  if (expectedDigest !== actionDigest) {
    return {
      _tag: "Refused",
      code: "action-not-admissible",
      detail: "action fields do not match the content-addressed action identity",
    };
  }
  const admitted = enumerateDesignActions(problem, state).find(
    (candidate) => candidate.actionDigest === action.actionDigest,
  );
  if (admitted === undefined) {
    return {
      _tag: "Refused",
      code: "action-not-admissible",
      detail: "action is not in the valid action set for the current state",
    };
  }
  const evaluated = evaluateDesignState(
    problem,
    constructionAfter(state, admitted),
  );
  if (evaluated._tag !== "Evaluated") {
    return {
      _tag: "Refused",
      code: "action-produced-invalid-construction",
      detail: evaluated.detail,
    };
  }
  return {
    _tag: "Applied",
    action: admitted,
    state: evaluated.state,
  };
}
