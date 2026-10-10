import type { Digest } from "../model.js";

export type ObservationSource =
  | {
      readonly kind: "machine-feedback";
      readonly systemId: string;
      readonly channel: string;
    }
  | {
      readonly kind: "metrology";
      readonly systemId: string;
      readonly method: string;
    }
  | {
      readonly kind: "human";
      readonly operatorId: string;
      readonly role: string;
    };

export type ProcessObservation =
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: ObservationSource;
      readonly kind: "dimensional-trend";
      readonly characteristicId: string;
      readonly valuesMm: readonly number[];
      readonly lowerLimitMm: number;
      readonly upperLimitMm: number;
      readonly measurementSystemId: string;
    }
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: ObservationSource;
      readonly kind: "fixture-distortion";
      readonly characteristicId: string;
      readonly unclampedFlatnessMm: number;
      readonly clampedFlatnessMm: number;
      readonly clampForceScale: number;
      readonly measurementSystemId: string;
    }
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: ObservationSource;
      readonly kind: "vibration";
      readonly toolId: string;
      readonly chatterIndex: number;
      readonly rmsAccelerationG: number;
    }
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: Extract<ObservationSource, { readonly kind: "human" }>;
      readonly kind: "human-correction";
      readonly field: "tool-stickout-mm" | "clamp-force-scale";
      readonly toolId?: string;
      readonly previousValue: number;
      readonly correctedValue: number;
      readonly reason: string;
    }
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: ObservationSource;
      readonly kind: "gage-rr";
      readonly measurementSystemId: string;
      readonly percentGrr: number;
      readonly ndc: number;
      readonly repeatabilityMm: number;
      readonly reproducibilityMm: number;
    }
  | {
      readonly schema: "gmr.process-observation/v1";
      readonly id: string;
      readonly source: ObservationSource;
      readonly kind: "thermal-drift";
      readonly baselineTemperatureC: number;
      readonly currentTemperatureC: number;
      readonly axis: "x" | "y" | "z";
      readonly measuredBiasMm: number;
      readonly measurementSystemId: string;
    };

export interface ToolAdjustment {
  readonly toolId: string;
  readonly diameterCorrectionMm: number;
  readonly stickoutMm?: number;
  readonly spindleScale: number;
  readonly feedScale: number;
}

export interface MeasurementSystemState {
  readonly systemId: string;
  readonly disposition: "trusted" | "quarantined";
  readonly reason?: string;
}

export interface ProcessControlState {
  readonly schema: "gmr.process-control-state/v1";
  readonly candidateDigest: Digest;
  readonly manufacturingPlanDigest: Digest;
  readonly revision: number;
  readonly toolAdjustments: readonly ToolAdjustment[];
  readonly clampForceScale: number;
  readonly thermalWorkOffsetMm: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly measurementSystems: readonly MeasurementSystemState[];
  readonly processHold: boolean;
  readonly holdReason?: string;
  readonly stateDigest: Digest;
}

export type ProcessDiagnosisCode =
  | "tool-wear-drift"
  | "clamp-induced-distortion"
  | "chatter-excessive-stickout"
  | "measurement-system-inadequate"
  | "thermal-drift"
  | "insufficient-evidence"
  | "no-exception";

export type RecoveryAction =
  | {
      readonly id: string;
      readonly _tag: "AdjustToolDiameter";
      readonly toolId: string;
      readonly deltaMm: number;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "SetClampForceScale";
      readonly from: number;
      readonly to: number;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "SetToolStickout";
      readonly toolId: string;
      readonly fromMm: number;
      readonly toMm: number;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "SetCutLoadScale";
      readonly toolId: string;
      readonly spindleScale: number;
      readonly feedScale: number;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "QuarantineMeasurementSystem";
      readonly measurementSystemId: string;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "ReleaseMeasurementSystem";
      readonly measurementSystemId: string;
      readonly basis: string;
    }
  | {
      readonly id: string;
      readonly _tag: "SetProcessHold";
      readonly hold: boolean;
      readonly reason: string;
    }
  | {
      readonly id: string;
      readonly _tag: "ApplyThermalWorkOffset";
      readonly axis: "x" | "y" | "z";
      readonly deltaMm: number;
      readonly basis: string;
    };

export interface RecoveryAssessment {
  readonly schema: "gmr.recovery-assessment/v1";
  readonly candidateDigest: Digest;
  readonly manufacturingPlanDigest: Digest;
  readonly controlStateDigest: Digest;
  readonly observationDigests: readonly Digest[];
  readonly diagnosis: ProcessDiagnosisCode;
  readonly evidenceQuality:
    | "sufficient"
    | "measurement-system-untrusted"
    | "insufficient";
  readonly evidence: readonly string[];
  readonly allowedActions: readonly RecoveryAction[];
  readonly recommendedActionId?: string;
  readonly disposition:
    | "action-recommended"
    | "hold-measurement-system"
    | "no-action"
    | "insufficient-evidence";
  readonly assessmentDigest: Digest;
}

export interface RecoveryActionApplication {
  readonly schema: "gmr.recovery-action-application/v1";
  readonly beforeStateDigest: Digest;
  readonly action: RecoveryAction;
  readonly after: ProcessControlState;
  readonly applicationDigest: Digest;
}

export interface RecoveryVerification {
  readonly schema: "gmr.recovery-verification/v1";
  readonly assessmentDigest: Digest;
  readonly adjustedStateDigest: Digest;
  readonly verificationObservationDigests: readonly Digest[];
  readonly disposition: "restored" | "not-restored" | "measurement-system-restored";
  readonly evidence: readonly string[];
  readonly verificationDigest: Digest;
}

export interface ProcessRecoveryScenario {
  readonly schema: "gmr.process-recovery-scenario/v1";
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly initialObservations: readonly unknown[];
  readonly verificationObservations: readonly unknown[];
  readonly expectedDiagnosis: Exclude<
    ProcessDiagnosisCode,
    "insufficient-evidence" | "no-exception"
  >;
  readonly expectedRecommendedAction: RecoveryAction["_tag"];
}

export interface ProcessRecoveryCaseStudy {
  readonly schema: "gmr.process-recovery-case-study/v1";
  readonly scenarioId: string;
  readonly title: string;
  readonly objective: string;
  readonly candidateDigest: Digest;
  readonly manufacturingPlanDigest: Digest;
  readonly initialState: ProcessControlState;
  readonly observations: readonly ProcessObservation[];
  readonly assessment: RecoveryAssessment;
  readonly application: RecoveryActionApplication;
  readonly verificationObservations: readonly ProcessObservation[];
  readonly verification: RecoveryVerification;
  readonly claims: readonly string[];
  readonly limitations: readonly string[];
  readonly caseStudyDigest: Digest;
}
export interface ProcessRecoveryCaseStudyArtifacts {
  readonly schema: "gmr.process-recovery-case-study-artifacts/v1";
  readonly caseStudyDigest: Digest;
  readonly backend: {
    readonly name: "reportlab";
    readonly version: string;
  };
  readonly reportPdf: {
    readonly path: string;
    readonly digest: Digest;
  };
  readonly artifactDigest: Digest;
}
