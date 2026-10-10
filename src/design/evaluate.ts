import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import type {
  CandidateHole,
  CandidateMetrics,
  CandidateViolation,
  DesignCandidate,
  DesignProblem,
  NumericRange,
  ProfilePoint,
  RootButtressParameters,
  TaperedPlateArmParameters,
} from "./model.js";

const EPS = 1e-9;

export function parameterValues(range: NumericRange): readonly number[] {
  const result: number[] = [];
  for (
    let value = range.min;
    value <= range.max + EPS;
    value += range.step
  ) {
    result.push(Number(value.toFixed(9)));
  }
  return result;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPS;
}

function rangeContains(range: NumericRange, value: number): boolean {
  return parameterValues(range).some((candidate) =>
    sameNumber(candidate, value),
  );
}

export function validateTaperedPlateArmParameters(
  problem: DesignProblem,
  parameters: TaperedPlateArmParameters,
): string | undefined {
  if (!rangeContains(problem.grammar.thicknessMm, parameters.thicknessMm)) {
    return "thicknessMm is outside the declared grammar";
  }
  if (
    !rangeContains(
      problem.grammar.rootHalfWidthMm,
      parameters.rootHalfWidthMm,
    )
  ) {
    return "rootHalfWidthMm is outside the declared grammar";
  }
  if (
    !rangeContains(
      problem.grammar.armHalfWidthMm,
      parameters.armHalfWidthMm,
    )
  ) {
    return "armHalfWidthMm is outside the declared grammar";
  }
  if (
    !rangeContains(
      problem.grammar.tipHalfWidthMm,
      parameters.tipHalfWidthMm,
    )
  ) {
    return "tipHalfWidthMm is outside the declared grammar";
  }
  if (parameters.armHalfWidthMm > parameters.rootHalfWidthMm + EPS) {
    return "armHalfWidthMm cannot exceed rootHalfWidthMm";
  }
  if (parameters.tipHalfWidthMm < parameters.armHalfWidthMm - EPS) {
    return "tipHalfWidthMm cannot be smaller than armHalfWidthMm";
  }
  return undefined;
}

function profileStations(problem: DesignProblem): {
  readonly shoulderX: number;
  readonly taperX: number;
  readonly endX: number;
} {
  const mountX = problem.interfaces.mount.mountHoleXFromDatumMm;
  const loadX = problem.interfaces.payload.axisXFromDatumMm;
  return {
    shoulderX: mountX + Math.max(12, (loadX - mountX) * 0.22),
    taperX: mountX + (loadX - mountX) * 0.7,
    endX: loadX + problem.interfaces.payload.endMarginMm,
  };
}

export function validateRootButtressParameters(
  problem: DesignProblem,
  buttress: RootButtressParameters,
): string | undefined {
  const range = problem.grammar.rootButtressLengthMm;
  if (range === undefined) {
    return "root buttress topology is not admitted by the declared grammar";
  }
  if (!rangeContains(range, buttress.lengthMm)) {
    return "root buttress length is outside the declared grammar";
  }
  const stations = profileStations(problem);
  if (stations.shoulderX + buttress.lengthMm >= stations.taperX - EPS) {
    return "root buttress must end before the arm taper station";
  }
  return undefined;
}

export function minimumTaperedPlateArmParameters(
  problem: DesignProblem,
): TaperedPlateArmParameters {
  return {
    thicknessMm: problem.grammar.thicknessMm.min,
    rootHalfWidthMm: problem.grammar.rootHalfWidthMm.min,
    armHalfWidthMm: problem.grammar.armHalfWidthMm.min,
    tipHalfWidthMm: problem.grammar.tipHalfWidthMm.min,
  };
}

function interpolateHalfWidth(
  profile: readonly ProfilePoint[],
  xMm: number,
): number {
  if (xMm <= profile[0]!.xMm) return profile[0]!.halfWidthMm;
  if (xMm >= profile.at(-1)!.xMm) return profile.at(-1)!.halfWidthMm;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = profile[index]!;
    const b = profile[index + 1]!;
    if (xMm >= a.xMm && xMm <= b.xMm) {
      const t = (xMm - a.xMm) / (b.xMm - a.xMm);
      return a.halfWidthMm + t * (b.halfWidthMm - a.halfWidthMm);
    }
  }
  throw new TypeError("profile interpolation failed at x=" + xMm);
}

function holeChordWidth(
  holes: readonly CandidateHole[],
  xMm: number,
): number {
  return holes.reduce((sum, hole) => {
    const radius = hole.diameterMm / 2;
    const dx = xMm - hole.center.x;
    if (Math.abs(dx) >= radius) return sum;
    return sum + 2 * Math.sqrt(Math.max(0, radius * radius - dx * dx));
  }, 0);
}

function sectionWidth(
  profile: readonly ProfilePoint[],
  holes: readonly CandidateHole[],
  xMm: number,
): number {
  return Math.max(
    1e-6,
    2 * interpolateHalfWidth(profile, xMm) - holeChordWidth(holes, xMm),
  );
}

function planformArea(
  profile: readonly ProfilePoint[],
  holes: readonly CandidateHole[],
): number {
  let area = 0;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = profile[index]!;
    const b = profile[index + 1]!;
    area +=
      (b.xMm - a.xMm) * (a.halfWidthMm + b.halfWidthMm);
  }
  const holesArea = holes.reduce((sum, hole) => {
    const radius = hole.diameterMm / 2;
    return sum + Math.PI * radius * radius;
  }, 0);
  return area - holesArea;
}

function contourLength(profile: readonly ProfilePoint[]): number {
  const upper = profile.reduce((sum, point, index) => {
    if (index === 0) return 0;
    const previous = profile[index - 1]!;
    return (
      sum +
      Math.hypot(
        point.xMm - previous.xMm,
        point.halfWidthMm - previous.halfWidthMm,
      )
    );
  }, 0);
  const start = profile[0]!;
  const end = profile.at(-1)!;
  return 2 * upper + 2 * start.halfWidthMm + 2 * end.halfWidthMm;
}

function structuralScreen(
  problem: DesignProblem,
  profile: readonly ProfilePoint[],
  holes: readonly CandidateHole[],
  thicknessMm: number,
): {
  readonly tipDeflectionMm: number;
  readonly maxStressMPa: number;
  readonly factorOfSafety: number;
} {
  const load = Math.abs(problem.loadCases[0]!.forceN);
  const supportX = problem.interfaces.mount.mountHoleXFromDatumMm;
  const loadX = problem.interfaces.payload.axisXFromDatumMm;
  const length = loadX - supportX;
  const sampleCount = 400;
  const dx = length / sampleCount;
  let complianceIntegral = 0;
  let maxStress = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const localX = index * dx;
    const modelX = supportX + localX;
    const width = sectionWidth(profile, holes, modelX);
    const inertia =
      (width * thicknessMm * thicknessMm * thicknessMm) / 12;
    const moment = load * (length - localX);
    const integrand =
      ((length - localX) * (length - localX)) /
      (problem.material.youngsModulusMPa * inertia);
    const weight =
      index === 0 || index === sampleCount ? 0.5 : 1;
    complianceIntegral += weight * integrand;
    const stress = (moment * (thicknessMm / 2)) / inertia;
    maxStress = Math.max(maxStress, stress);
  }

  const tipDeflectionMm = load * complianceIntegral * dx;
  const factorOfSafety =
    maxStress <= EPS
      ? Number.POSITIVE_INFINITY
      : problem.material.yieldStrengthMPa / maxStress;
  return { tipDeflectionMm, maxStressMPa: maxStress, factorOfSafety };
}

function makeProfile(
  problem: DesignProblem,
  parameters: TaperedPlateArmParameters,
  rootButtress?: RootButtressParameters,
): readonly ProfilePoint[] {
  const { shoulderX, taperX, endX } = profileStations(problem);
  const profile: ProfilePoint[] = [
    { xMm: 0, halfWidthMm: parameters.rootHalfWidthMm },
    { xMm: shoulderX, halfWidthMm: parameters.rootHalfWidthMm },
  ];
  if (rootButtress !== undefined) {
    profile.push({
      xMm: shoulderX + rootButtress.lengthMm,
      halfWidthMm: parameters.rootHalfWidthMm,
    });
  }
  profile.push(
    { xMm: taperX, halfWidthMm: parameters.armHalfWidthMm },
    { xMm: endX, halfWidthMm: parameters.tipHalfWidthMm },
  );
  return profile;
}

function makeHoles(problem: DesignProblem): readonly CandidateHole[] {
  const mount = problem.interfaces.mount;
  const payload = problem.interfaces.payload;
  return [
    {
      id: mount.id + ".upper",
      role: "mount",
      center: {
        x: mount.mountHoleXFromDatumMm,
        y: mount.mountHoleSpacingMm / 2,
      },
      diameterMm: mount.mountHoleDiameterMm,
    },
    {
      id: mount.id + ".lower",
      role: "mount",
      center: {
        x: mount.mountHoleXFromDatumMm,
        y: -mount.mountHoleSpacingMm / 2,
      },
      diameterMm: mount.mountHoleDiameterMm,
    },
    {
      id: payload.id,
      role: "load",
      center: { x: payload.axisXFromDatumMm, y: 0 },
      diameterMm: payload.boreDiameterMm,
    },
    ...problem.keepOuts.map((keepOut) => ({
      id: keepOut.id,
      role: "keepout" as const,
      center: keepOut.center,
      diameterMm: keepOut.diameterMm,
    })),
  ];
}

function candidateOrdinal(
  problem: DesignProblem,
  target: TaperedPlateArmParameters,
): number {
  let ordinal = 1;
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
          if (
            sameNumber(thicknessMm, target.thicknessMm) &&
            sameNumber(rootHalfWidthMm, target.rootHalfWidthMm) &&
            sameNumber(armHalfWidthMm, target.armHalfWidthMm) &&
            sameNumber(tipHalfWidthMm, target.tipHalfWidthMm)
          ) {
            return ordinal;
          }
          ordinal += 1;
        }
      }
    }
  }
  throw new TypeError("parameters are not an admitted grammar construction");
}

function candidateId(
  problem: DesignProblem,
  parameters: TaperedPlateArmParameters,
  rootButtress?: RootButtressParameters,
): string {
  const base =
    "candidate-" +
    String(candidateOrdinal(problem, parameters)).padStart(4, "0");
  if (rootButtress === undefined) return base;
  return (
    base +
    "-buttress-" +
    Number(rootButtress.lengthMm.toFixed(9)).toString().replace(".", "p")
  );
}

export function evaluatePlateArmCandidate(
  problem: DesignProblem,
  parameters: TaperedPlateArmParameters,
  rootButtress?: RootButtressParameters,
): DesignCandidate {
  const invalid = validateTaperedPlateArmParameters(problem, parameters);
  if (invalid !== undefined) throw new TypeError(invalid);
  if (rootButtress !== undefined) {
    const topologyInvalid = validateRootButtressParameters(
      problem,
      rootButtress,
    );
    if (topologyInvalid !== undefined) throw new TypeError(topologyInvalid);
  }

  const problemDigest = semanticDigest(problem);
  const profile = makeProfile(problem, parameters, rootButtress);
  const holes = makeHoles(problem);
  const area = planformArea(profile, holes);
  const volume = area * parameters.thicknessMm;
  const massG =
    volume * (problem.material.densityKgPerM3 / 1_000_000);
  const structural = structuralScreen(
    problem,
    profile,
    holes,
    parameters.thicknessMm,
  );
  const perimeter = contourLength(profile);
  const cycleProxyMinutes = perimeter / 800 + holes.length * 0.12 + 1.5;
  const metrics: CandidateMetrics = {
    planformAreaMm2: area,
    volumeMm3: volume,
    massG,
    screeningTipDeflectionMm: structural.tipDeflectionMm,
    screeningMaxBendingStressMPa: structural.maxStressMPa,
    screeningStaticFactorOfSafety: structural.factorOfSafety,
    contourLengthMm: perimeter,
    cycleProxyMinutes,
    plannedSetups: 1,
  };

  const violations: CandidateViolation[] = [];
  const endX = profile.at(-1)!.xMm;
  const maxHalfWidth = Math.max(
    ...profile.map((point) => point.halfWidthMm),
  );
  if (endX > problem.manufacturing.stock.maxXmm + EPS) {
    violations.push({
      code: "envelope-x",
      detail:
        "candidate length " +
        endX.toFixed(3) +
        " exceeds stock X " +
        problem.manufacturing.stock.maxXmm.toFixed(3),
    });
  }
  if (2 * maxHalfWidth > problem.manufacturing.stock.maxYmm + EPS) {
    violations.push({
      code: "envelope-y",
      detail:
        "candidate width " +
        (2 * maxHalfWidth).toFixed(3) +
        " exceeds stock Y " +
        problem.manufacturing.stock.maxYmm.toFixed(3),
    });
  }
  if (parameters.thicknessMm > problem.manufacturing.stock.maxZmm + EPS) {
    violations.push({
      code: "envelope-z",
      detail:
        "candidate thickness " +
        parameters.thicknessMm.toFixed(3) +
        " exceeds stock Z " +
        problem.manufacturing.stock.maxZmm.toFixed(3),
    });
  }

  for (const hole of holes) {
    const available =
      interpolateHalfWidth(profile, hole.center.x) -
      Math.abs(hole.center.y) -
      hole.diameterMm / 2;
    if (available + EPS < problem.requirements.minEdgeDistanceMm) {
      violations.push({
        code: "hole-edge-distance",
        detail:
          hole.id +
          " edge distance " +
          available.toFixed(3) +
          " < required " +
          problem.requirements.minEdgeDistanceMm.toFixed(3),
      });
    }
  }

  if (
    metrics.screeningTipDeflectionMm >
    problem.requirements.maxTipDeflectionMm + EPS
  ) {
    violations.push({
      code: "deflection",
      detail:
        "screening deflection " +
        metrics.screeningTipDeflectionMm.toFixed(6) +
        " > " +
        problem.requirements.maxTipDeflectionMm.toFixed(6) +
        " mm",
    });
  }
  if (
    metrics.screeningStaticFactorOfSafety + EPS <
    problem.requirements.minStaticFactorOfSafety
  ) {
    violations.push({
      code: "factor-of-safety",
      detail:
        "screening FoS " +
        metrics.screeningStaticFactorOfSafety.toFixed(3) +
        " < " +
        problem.requirements.minStaticFactorOfSafety.toFixed(3),
    });
  }
  if (
    problem.requirements.maxMassG !== undefined &&
    metrics.massG > problem.requirements.maxMassG + EPS
  ) {
    violations.push({
      code: "mass",
      detail:
        "mass " +
        metrics.massG.toFixed(3) +
        " g > " +
        problem.requirements.maxMassG.toFixed(3) +
        " g",
    });
  }
  if (problem.manufacturing.maxSetups < metrics.plannedSetups) {
    violations.push({
      code: "setup-limit",
      detail:
        "candidate requires " +
        metrics.plannedSetups +
        " setup(s), above declared limit " +
        problem.manufacturing.maxSetups,
    });
  }

  const family =
    rootButtress === undefined
      ? ("tapered-plate-arm" as const)
      : ("root-buttressed-plate-arm" as const);
  const base = {
    schema: "gmr.design-candidate/v1" as const,
    id: candidateId(problem, parameters, rootButtress),
    problemDigest,
    family,
    parameters,
    ...(rootButtress === undefined ? {} : { rootButtress }),
    profile,
    holes,
    metrics,
    violations,
    disposition:
      violations.length === 0 ? ("feasible" as const) : ("rejected" as const),
  };
  return { ...base, candidateDigest: semanticDigest(base) };
}

export function evaluateTaperedPlateArmCandidate(
  problem: DesignProblem,
  parameters: TaperedPlateArmParameters,
): DesignCandidate {
  return evaluatePlateArmCandidate(problem, parameters);
}

export function compareCandidatesByObjectives(
  problem: DesignProblem,
  left: DesignCandidate,
  right: DesignCandidate,
): number {
  const objectives = [...problem.objectives].sort(
    (a, b) => a.priority - b.priority,
  );
  for (const objective of objectives) {
    const leftValue =
      objective.kind === "minimize-mass"
        ? left.metrics.massG
        : left.metrics.cycleProxyMinutes;
    const rightValue =
      objective.kind === "minimize-mass"
        ? right.metrics.massG
        : right.metrics.cycleProxyMinutes;
    if (Math.abs(leftValue - rightValue) > EPS) {
      return leftValue - rightValue;
    }
  }
  return left.id.localeCompare(right.id);
}
