import type { Digest, Point2 } from "../model.js";

export interface NumericRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface MaterialDefinition {
  readonly id: string;
  readonly label: string;
  readonly youngsModulusMPa: number;
  readonly poissonRatio: number;
  readonly densityKgPerM3: number;
  readonly yieldStrengthMPa: number;
  readonly basis: string;
}

export interface MountInterface {
  readonly id: string;
  readonly datum: "A";
  readonly mountHoleDiameterMm: number;
  readonly mountHoleXFromDatumMm: number;
  readonly mountHoleSpacingMm: number;
}

export interface PayloadInterface {
  readonly id: string;
  readonly boreDiameterMm: number;
  readonly axisXFromDatumMm: number;
  readonly endMarginMm: number;
}

export interface CircularKeepOut {
  readonly kind: "circle-through";
  readonly id: string;
  readonly center: Point2;
  readonly diameterMm: number;
}

export interface LoadCase {
  readonly id: string;
  readonly interfaceId: string;
  readonly forceN: number;
  readonly axis: "z";
}

export interface DesignRequirements {
  readonly maxTipDeflectionMm: number;
  readonly minStaticFactorOfSafety: number;
  readonly minEdgeDistanceMm: number;
  readonly maxMassG?: number;
}

export interface ThreeAxisMillingCapability {
  readonly process: "three-axis-milling";
  readonly maxSetups: 1 | 2;
  readonly minimumProfileToolDiameterMm: number;
  readonly stock: {
    readonly kind: "plate";
    readonly maxXmm: number;
    readonly maxYmm: number;
    readonly maxZmm: number;
  };
  readonly controllerTargets: readonly (
    | "generic-rs274"
    | "haas-ngc"
    | "linuxcnc"
  )[];
}

export interface TaperedPlateArmGrammar {
  readonly family: "tapered-plate-arm";
  readonly thicknessMm: NumericRange;
  readonly rootHalfWidthMm: NumericRange;
  readonly armHalfWidthMm: NumericRange;
  readonly tipHalfWidthMm: NumericRange;
  readonly rootButtressLengthMm?: NumericRange;
}

export type DesignObjective =
  | { readonly kind: "minimize-mass"; readonly priority: number }
  | { readonly kind: "minimize-cycle-proxy"; readonly priority: number };

export interface DesignProblem {
  readonly schema: "gmr.design-problem/v1";
  readonly id: string;
  readonly units: "mm-N-MPa";
  readonly interfaces: {
    readonly mount: MountInterface;
    readonly payload: PayloadInterface;
  };
  readonly keepOuts: readonly CircularKeepOut[];
  readonly loadCases: readonly LoadCase[];
  readonly requirements: DesignRequirements;
  readonly material: MaterialDefinition;
  readonly manufacturing: ThreeAxisMillingCapability;
  readonly grammar: TaperedPlateArmGrammar;
  readonly objectives: readonly DesignObjective[];
}

export interface ProfilePoint {
  readonly xMm: number;
  readonly halfWidthMm: number;
}

export interface CandidateHole {
  readonly id: string;
  readonly role: "mount" | "load" | "keepout";
  readonly center: Point2;
  readonly diameterMm: number;
}

export interface TaperedPlateArmParameters {
  readonly thicknessMm: number;
  readonly rootHalfWidthMm: number;
  readonly armHalfWidthMm: number;
  readonly tipHalfWidthMm: number;
}

export interface RootButtressParameters {
  readonly lengthMm: number;
}

export type CandidateViolationCode =
  | "envelope-x"
  | "envelope-y"
  | "envelope-z"
  | "hole-edge-distance"
  | "deflection"
  | "factor-of-safety"
  | "mass"
  | "setup-limit";

export interface CandidateViolation {
  readonly code: CandidateViolationCode;
  readonly detail: string;
}

export interface CandidateMetrics {
  readonly planformAreaMm2: number;
  readonly volumeMm3: number;
  readonly massG: number;
  readonly screeningTipDeflectionMm: number;
  readonly screeningMaxBendingStressMPa: number;
  readonly screeningStaticFactorOfSafety: number;
  readonly contourLengthMm: number;
  readonly cycleProxyMinutes: number;
  readonly plannedSetups: 1 | 2;
}

export type DesignCandidateFamily =
  | "tapered-plate-arm"
  | "root-buttressed-plate-arm";

export interface DesignCandidate {
  readonly schema: "gmr.design-candidate/v1";
  readonly id: string;
  readonly problemDigest: Digest;
  readonly family: DesignCandidateFamily;
  readonly parameters: TaperedPlateArmParameters;
  readonly rootButtress?: RootButtressParameters;
  readonly profile: readonly ProfilePoint[];
  readonly holes: readonly CandidateHole[];
  readonly metrics: CandidateMetrics;
  readonly violations: readonly CandidateViolation[];
  readonly disposition: "feasible" | "rejected";
  readonly candidateDigest: Digest;
}

export interface DesignSynthesis {
  readonly schema: "gmr.design-synthesis/v1";
  readonly problem: DesignProblem;
  readonly problemDigest: Digest;
  readonly candidates: readonly DesignCandidate[];
  readonly feasibleCandidates: readonly DesignCandidate[];
  readonly selectedCandidateId?: string;
  readonly synthesisDigest: Digest;
}
