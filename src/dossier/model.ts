import type { Digest, Point2 } from "../model.js";

export interface DatumDefinition {
  readonly id: "A" | "B" | "C";
  readonly semanticFeatureId: string;
  readonly kind: "plane" | "axis";
  readonly role: string;
}

export interface SizeRequirement {
  readonly id: string;
  readonly semanticFeatureId: string;
  readonly nominalMm: number;
  readonly lowerLimitMm: number;
  readonly upperLimitMm: number;
  readonly note: string;
}

export interface GeometricRequirement {
  readonly id: string;
  readonly semanticFeatureId: string;
  readonly control: "flatness" | "position" | "profile";
  readonly toleranceMm: number;
  readonly datumReferenceFrame: readonly ("A" | "B" | "C")[];
  readonly note: string;
}

export interface BasicDimension {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly valueMm: number;
}

export interface DrawingSpec {
  readonly schema: "gmr.drawing-spec/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly drawingNumber: string;
  readonly revision: "A";
  readonly title: string;
  readonly units: "mm";
  readonly scale: "2:1";
  readonly material: string;
  readonly standardReferences: readonly string[];
  readonly datums: readonly DatumDefinition[];
  readonly sizes: readonly SizeRequirement[];
  readonly basicDimensions: readonly BasicDimension[];
  readonly geometricRequirements: readonly GeometricRequirement[];
  readonly notes: readonly string[];
  readonly drawingDigest: Digest;
}

export interface DfmCheck {
  readonly id: string;
  readonly category:
    | "stock"
    | "access"
    | "tooling"
    | "workholding"
    | "tolerance-process"
    | "inspection";
  readonly disposition: "pass" | "conditional" | "fail";
  readonly statement: string;
  readonly evidence: string;
}

export interface DfmReport {
  readonly schema: "gmr.dfm-report/v1";
  readonly candidateDigest: Digest;
  readonly manufacturingPlanDigest: Digest;
  readonly checks: readonly DfmCheck[];
  readonly disposition: "pass-with-conditions" | "fail";
  readonly limitations: readonly string[];
  readonly dfmDigest: Digest;
}

export interface InspectionCharacteristic {
  readonly id: string;
  readonly sourceRequirementId: string;
  readonly description: string;
  readonly nominalMm?: number;
  readonly lowerLimitMm?: number;
  readonly upperLimitMm?: number;
  readonly maximumMm?: number;
  readonly method:
    | "micrometer"
    | "pin-gage"
    | "bore-gage-or-cmm"
    | "cmm-plane"
    | "cmm-position"
    | "cmm-profile";
  readonly resolutionMm: number;
  readonly sampling: string;
  readonly acceptance: string;
}

export interface InspectionPlan {
  readonly schema: "gmr.inspection-plan/v1";
  readonly candidateDigest: Digest;
  readonly drawingDigest: Digest;
  readonly characteristics: readonly InspectionCharacteristic[];
  readonly notes: readonly string[];
  readonly inspectionPlanDigest: Digest;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FittedCircle {
  readonly center: Point2;
  readonly radiusMm: number;
  readonly diameterMm: number;
  readonly radialResidualRangeMm: number;
}

export interface FittedPlane {
  readonly zEqualsAxPlusByPlusC: {
    readonly a: number;
    readonly b: number;
    readonly c: number;
  };
  readonly residualRangeMm: number;
}

export interface FirstArticleObservation {
  readonly characteristicId: string;
  readonly actualValueMm: number;
  readonly measuredValueMm: number;
  readonly measurementUncertaintyMm: number;
  readonly disposition: "pass" | "fail";
  readonly method: InspectionCharacteristic["method"];
  readonly evidence?: {
    readonly sampledPointCount: number;
    readonly fittedCircle?: FittedCircle;
    readonly fittedPlane?: FittedPlane;
  };
}

export interface CapabilityProjection {
  readonly characteristicId: string;
  readonly sampleCount: number;
  readonly meanMm: number;
  readonly sampleStdDevMm: number;
  readonly cp?: number;
  readonly cpk?: number;
  readonly observedPassRate: number;
  readonly observationsMm: readonly number[];
  readonly basis: "synthetic-model";
  readonly note: string;
}

export interface SimulatedMetrology {
  readonly schema: "gmr.simulated-metrology/v1";
  readonly candidateDigest: Digest;
  readonly inspectionPlanDigest: Digest;
  readonly seed: Digest;
  readonly firstArticle: readonly FirstArticleObservation[];
  readonly capability: readonly CapabilityProjection[];
  readonly limitations: readonly string[];
  readonly metrologyDigest: Digest;
}

export interface ProveoutCheck {
  readonly id: string;
  readonly disposition: "pass" | "conditional" | "fail";
  readonly statement: string;
  readonly evidence: string;
}

export interface VirtualProveout {
  readonly schema: "gmr.virtual-proveout/v1";
  readonly candidateDigest: Digest;
  readonly motionDigest: Digest;
  readonly virtualMachine: {
    readonly id: "portfolio-3axis-mill-v1";
    readonly xRangeMm: readonly [-25, 150];
    readonly yRangeMm: readonly [-75, 75];
    readonly zRangeMm: readonly [-30, 125];
  };
  readonly checks: readonly ProveoutCheck[];
  readonly minimumRapidZMm: number;
  readonly minimumCutZMm: number;
  readonly maximumCutZMm: number;
  readonly externalSimulator: {
    readonly recommended: "CAMotics";
    readonly parserCompatibility: "supported-subset";
    readonly executionStatus: "not-run-environment-dependency";
    readonly note: string;
  };
  readonly disposition: "pass-with-conditions" | "fail";
  readonly limitations: readonly string[];
  readonly proveoutDigest: Digest;
}

export interface ManufacturingDossier {
  readonly schema: "gmr.manufacturing-dossier/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly drawing: DrawingSpec;
  readonly dfm: DfmReport;
  readonly inspection: InspectionPlan;
  readonly metrology: SimulatedMetrology;
  readonly proveout: VirtualProveout;
  readonly dossierDigest: Digest;
}

export interface DossierArtifactRef {
  readonly path: string;
  readonly digest: Digest;
}

export interface DossierArtifacts {
  readonly schema: "gmr.manufacturing-dossier-artifacts/v1";
  readonly dossierDigest: Digest;
  readonly backend: {
    readonly name: "reportlab";
    readonly version: string;
  };
  readonly drawingSvg: DossierArtifactRef;
  readonly drawingPdf: DossierArtifactRef;
  readonly dfmPdf: DossierArtifactRef;
  readonly inspectionPdf: DossierArtifactRef;
  readonly metrologyCsv: DossierArtifactRef;
  readonly metrologyPdf: DossierArtifactRef;
  readonly setupSheetPdf: DossierArtifactRef;
  readonly artifactDigest: Digest;
}