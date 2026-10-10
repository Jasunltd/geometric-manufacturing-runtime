import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import {
  applyDesignAction,
  enumerateDesignActions,
  type DesignAction,
} from "./actions.js";
import {
  compareCandidatesByObjectives,
  minimumTaperedPlateArmParameters,
} from "./evaluate.js";
import type { DesignProblem } from "./model.js";
import {
  evaluateDesignState,
  type DesignState,
} from "./state.js";

export interface DesignSearchOptions {
  readonly maxExpandedStates?: number;
}

export interface DesignSearchEdge {
  readonly fromStateDigest: Digest;
  readonly toStateDigest: Digest;
  readonly action: DesignAction;
  readonly edgeDigest: Digest;
}

export interface DesignSearch {
  readonly schema: "gmr.design-search/v1";
  readonly problemDigest: Digest;
  readonly initialStateDigest: Digest;
  readonly disposition: "winner-found" | "exhausted" | "budget-exhausted";
  readonly expandedStateCount: number;
  readonly generatedStateCount: number;
  readonly states: readonly DesignState[];
  readonly edges: readonly DesignSearchEdge[];
  readonly winningPath: readonly DesignSearchEdge[];
  readonly winner?: DesignState;
  readonly searchDigest: Digest;
}

function compareStates(
  problem: DesignProblem,
  left: DesignState,
  right: DesignState,
): number {
  const objective = compareCandidatesByObjectives(
    problem,
    left.candidate,
    right.candidate,
  );
  if (objective !== 0) return objective;

  const leftViolations = left.candidate.violations.length;
  const rightViolations = right.candidate.violations.length;
  if (leftViolations !== rightViolations) {
    return leftViolations - rightViolations;
  }
  return left.stateDigest.localeCompare(right.stateDigest);
}

function winningPath(
  initialStateDigest: Digest,
  winnerStateDigest: Digest,
  parents: ReadonlyMap<Digest, DesignSearchEdge>,
): readonly DesignSearchEdge[] {
  const reversed: DesignSearchEdge[] = [];
  let current = winnerStateDigest;
  while (current !== initialStateDigest) {
    const edge = parents.get(current);
    if (edge === undefined) {
      throw new TypeError("search provenance is incomplete");
    }
    reversed.push(edge);
    current = edge.fromStateDigest;
  }
  return reversed.reverse();
}

export function searchDesign(
  problem: DesignProblem,
  options: DesignSearchOptions = {},
): DesignSearch {
  const maxExpandedStates = options.maxExpandedStates ?? 256;
  if (
    !Number.isInteger(maxExpandedStates) ||
    maxExpandedStates <= 0
  ) {
    throw new TypeError("maxExpandedStates must be a positive integer");
  }

  const initialEvaluation = evaluateDesignState(
    problem,
    minimumTaperedPlateArmParameters(problem),
  );
  if (initialEvaluation._tag !== "Evaluated") {
    throw new TypeError(
      "declared grammar minimum is not a valid construction: " +
        initialEvaluation.detail,
    );
  }
  const initial = initialEvaluation.state;

  const states = new Map<Digest, DesignState>([
    [initial.stateDigest, initial],
  ]);
  const frontier: Digest[] = [initial.stateDigest];
  const expanded = new Set<Digest>();
  const edges: DesignSearchEdge[] = [];
  const parents = new Map<Digest, DesignSearchEdge>();
  let winner: DesignState | undefined;

  while (
    frontier.length > 0 &&
    expanded.size < maxExpandedStates
  ) {
    frontier.sort((leftDigest, rightDigest) =>
      compareStates(
        problem,
        states.get(leftDigest)!,
        states.get(rightDigest)!,
      ),
    );
    const currentDigest = frontier.shift()!;
    if (expanded.has(currentDigest)) continue;
    const current = states.get(currentDigest)!;
    expanded.add(currentDigest);

    if (current.candidate.disposition === "feasible") {
      winner = current;
      break;
    }

    for (const action of enumerateDesignActions(problem, current)) {
      const application = applyDesignAction(problem, current, action);
      if (application._tag !== "Applied") continue;
      const next = application.state;
      const edgeBase = {
        fromStateDigest: current.stateDigest,
        toStateDigest: next.stateDigest,
        action: application.action,
      };
      const edge: DesignSearchEdge = {
        ...edgeBase,
        edgeDigest: semanticDigest(edgeBase),
      };
      edges.push(edge);

      if (!states.has(next.stateDigest)) {
        states.set(next.stateDigest, next);
        frontier.push(next.stateDigest);
        parents.set(next.stateDigest, edge);
      }
    }
  }

  const disposition =
    winner !== undefined
      ? ("winner-found" as const)
      : frontier.length === 0
        ? ("exhausted" as const)
        : ("budget-exhausted" as const);
  const orderedStates = [...states.values()].sort((left, right) =>
    left.candidate.id.localeCompare(right.candidate.id),
  );
  const path =
    winner === undefined
      ? []
      : winningPath(
          initial.stateDigest,
          winner.stateDigest,
          parents,
        );
  const base = {
    schema: "gmr.design-search/v1" as const,
    problemDigest: semanticDigest(problem),
    initialStateDigest: initial.stateDigest,
    disposition,
    expandedStateCount: expanded.size,
    generatedStateCount: states.size,
    states: orderedStates,
    edges,
    winningPath: path,
    ...(winner === undefined ? {} : { winner }),
  };
  return {
    ...base,
    searchDigest: semanticDigest(base),
  };
}
