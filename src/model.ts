export type Digest = `sha256:${string}`;

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface BoxStock {
  readonly kind: "box";
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

export interface FlatEndMillTool {
  readonly kind: "flat-end-mill";
  readonly id: string;
  readonly nominalDiameter: number;
}

export interface CapsuleSweepOperation {
  readonly kind: "capsule-sweep";
  readonly id: string;
  readonly toolId: string;
  readonly start: Point2;
  readonly end: Point2;
  readonly topZ: number;
  readonly bottomZ: number;
  readonly maxRadialCompensation: number;
}

export interface ManufacturingProgramDefinition {
  readonly schema: "gmr.program/v1";
  readonly id: string;
  readonly units: "mm";
  readonly stock: BoxStock;
  readonly tools: readonly FlatEndMillTool[];
  readonly operations: readonly CapsuleSweepOperation[];
}

export interface GeneratedCapsule {
  readonly kind: "generated-capsule";
  readonly operationId: string;
  readonly toolId: string;
  readonly start: Point2;
  readonly end: Point2;
  readonly topZ: number;
  readonly bottomZ: number;
  readonly radius: number;
  readonly width: number;
  readonly pathLength: number;
  readonly planarArea: number;
  readonly removedVolume: number;
}

export interface ManufacturingProgram {
  readonly schema: "gmr.compiled-program/v1";
  readonly definition: ManufacturingProgramDefinition;
  readonly geometry: readonly GeneratedCapsule[];
  readonly definitionDigest: Digest;
  readonly geometryDigest: Digest;
}

export type CompileResult<T> =
  | {
      readonly _tag: "Compiled";
      readonly value: T;
      readonly digest: Digest;
    }
  | {
      readonly _tag: "CompileError";
      readonly code: string;
      readonly detail: string;
    }
  | {
      readonly _tag: "Unsupported";
      readonly code: string;
      readonly detail: string;
    };

export interface AxisRange {
  readonly min: number;
  readonly max: number;
}

export interface MachineModel {
  readonly schema: "gmr.machine/v1";
  readonly id: string;
  readonly units: "mm";
  readonly axes: readonly ["X", "Y", "Z"];
  readonly workEnvelope: {
    readonly x: AxisRange;
    readonly y: AxisRange;
    readonly z: AxisRange;
  };
  readonly safeZ: number;
  readonly feedMmPerMin: number;
  readonly supportsCircularInterpolation: boolean;
}

export interface ToolMeasurement {
  readonly toolId: string;
  readonly measuredDiameter: number;
}

export type SnapshotFreshness =
  | {
      readonly state: "current";
      readonly observedAt: string;
    }
  | {
      readonly state: "stale";
      readonly observedAt: string;
      readonly reason: string;
    };

export interface PhysicalStateSnapshot {
  readonly schema: "gmr.physical-state/v1";
  readonly snapshotId: string;
  readonly machineId: string;
  readonly workOffset: "G54";
  readonly toolMeasurements: readonly ToolMeasurement[];
  readonly freshness: SnapshotFreshness;
}

export interface RadialCompensation {
  readonly operationId: string;
  readonly toolId: string;
  readonly nominalDiameter: number;
  readonly measuredDiameter: number;
  readonly radialDelta: number;
}

export type MotionPrimitive =
  | {
      readonly _tag: "CenterlineSweep";
      readonly operationId: string;
      readonly toolId: string;
      readonly start: Point2;
      readonly end: Point2;
      readonly z: number;
    }
  | {
      readonly _tag: "OffsetCapsuleBoundarySweep";
      readonly operationId: string;
      readonly toolId: string;
      readonly start: Point2;
      readonly end: Point2;
      readonly z: number;
      readonly offsetRadius: number;
    };

export interface ExecutionPlan {
  readonly schema: "gmr.execution-plan/v1";
  readonly programDefinitionDigest: Digest;
  readonly canonicalGeometryDigest: Digest;
  readonly machineId: string;
  readonly stateSnapshotId: string;
  readonly workOffset: "G54";
  readonly safeZ: number;
  readonly feedMmPerMin: number;
  readonly compensation: readonly RadialCompensation[];
  readonly motion: readonly MotionPrimitive[];
  readonly planDigest: Digest;
}

export type BindingRefusalCode =
  | "machine-id-mismatch"
  | "stale-physical-state"
  | "missing-tool-measurement"
  | "tool-too-large"
  | "compensation-limit"
  | "coverage-gap-risk"
  | "outside-machine-envelope"
  | "circular-interpolation-required";

export type BindingResult =
  | {
      readonly _tag: "Bound";
      readonly plan: ExecutionPlan;
    }
  | {
      readonly _tag: "Refused";
      readonly code: BindingRefusalCode;
      readonly detail: string;
    };

export interface GCodeArtifact {
  readonly _tag: "GCodeArtifact";
  readonly backend: "generic-rs274";
  readonly planDigest: Digest;
  readonly artifactDigest: Digest;
  readonly text: string;
}

export interface PreparedExecutionArtifact {
  readonly plan: ExecutionPlan;
  readonly artifact: GCodeArtifact;
  readonly stateSnapshot: PhysicalStateSnapshot;
}
