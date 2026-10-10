import { semanticDigest } from "../integrity/canonical.js";
import type {
  DesignCandidate,
  DesignProblem,
  DesignSynthesis,
} from "./model.js";
import {
  compareCandidatesByObjectives,
  evaluatePlateArmCandidate,
  parameterValues,
  validateRootButtressParameters,
} from "./evaluate.js";

const EPS = 1e-9;

export function synthesizeDesignSpace(problem: DesignProblem): DesignSynthesis {
  const problemDigest = semanticDigest(problem);
  const candidates: DesignCandidate[] = [];
  const buttressLengths =
    problem.grammar.rootButtressLengthMm === undefined
      ? []
      : parameterValues(problem.grammar.rootButtressLengthMm);

  for (const thicknessMm of parameterValues(problem.grammar.thicknessMm)) {
    for (const rootHalfWidthMm of parameterValues(
      problem.grammar.rootHalfWidthMm,
    )) {
      for (const armHalfWidthMm of parameterValues(
        problem.grammar.armHalfWidthMm,
      )) {
        for (const tipHalfWidthMm of parameterValues(
          problem.grammar.tipHalfWidthMm,
        )) {
          if (
            armHalfWidthMm > rootHalfWidthMm + EPS ||
            tipHalfWidthMm < armHalfWidthMm - EPS
          ) {
            continue;
          }
          const parameters = {
            thicknessMm,
            rootHalfWidthMm,
            armHalfWidthMm,
            tipHalfWidthMm,
          };
          candidates.push(
            evaluatePlateArmCandidate(problem, parameters),
          );
          for (const lengthMm of buttressLengths) {
            const rootButtress = { lengthMm };
            if (
              validateRootButtressParameters(problem, rootButtress) !==
              undefined
            ) {
              continue;
            }
            candidates.push(
              evaluatePlateArmCandidate(
                problem,
                parameters,
                rootButtress,
              ),
            );
          }
        }
      }
    }
  }

  const feasibleCandidates = candidates
    .filter((candidate) => candidate.disposition === "feasible")
    .sort((a, b) => compareCandidatesByObjectives(problem, a, b));

  const base = {
    schema: "gmr.design-synthesis/v1" as const,
    problem,
    problemDigest,
    candidates,
    feasibleCandidates,
    ...(feasibleCandidates[0] === undefined
      ? {}
      : { selectedCandidateId: feasibleCandidates[0].id }),
  };
  return { ...base, synthesisDigest: semanticDigest(base) };
}
