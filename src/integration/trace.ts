import { semanticDigest } from "../integrity/canonical.js";
import type {
  Digest,
  ExecutionPlan,
  ManufacturingProgram,
} from "../model.js";

export interface EngineeringEvidenceBinding {
  readonly schema: "gmr.engineering-evidence-binding/v1";
  readonly researchPackDigest: Digest;
  readonly subjectRevisionDigest: Digest;
  readonly requirementIds: readonly string[];
  readonly limitations: readonly string[];
}

export interface CyberPhysicalEvidenceBinding {
  readonly schema: "gmr.cyber-physical-evidence-binding/v1";
  readonly sourceId: string;
  readonly upstreamEvidenceDigest: Digest;
  readonly stateSnapshotId: string;
}

export interface ExecutionObservationBinding {
  readonly schema: "gmr.execution-observation-binding/v1";
  readonly executionReceiptDigest: Digest;
  readonly observationDigest: Digest;
}

export interface FullSystemTrace {
  readonly schema: "gmr.full-system-trace/v1";
  readonly programDefinitionDigest: Digest;
  readonly canonicalGeometryDigest: Digest;
  readonly planDigest: Digest;
  readonly machineId: string;
  readonly stateSnapshotId: string;
  readonly engineeringEvidence?: EngineeringEvidenceBinding;
  readonly cyberPhysicalEvidence?: CyberPhysicalEvidenceBinding;
  readonly executionObservation?: ExecutionObservationBinding;
  readonly traceDigest: Digest;
}

export interface FullSystemTraceInput {
  readonly program: ManufacturingProgram;
  readonly plan: ExecutionPlan;
  readonly engineeringEvidence?: EngineeringEvidenceBinding;
  readonly cyberPhysicalEvidence?: CyberPhysicalEvidenceBinding;
  readonly executionObservation?: ExecutionObservationBinding;
}

export function buildFullSystemTrace(
  input: FullSystemTraceInput,
): FullSystemTrace {
  if (
    input.plan.programDefinitionDigest !== input.program.definitionDigest ||
    input.plan.canonicalGeometryDigest !== input.program.geometryDigest
  ) {
    throw new TypeError(
      "execution plan is not bound to the supplied canonical manufacturing program",
    );
  }

  if (
    input.cyberPhysicalEvidence !== undefined &&
    input.cyberPhysicalEvidence.stateSnapshotId !==
      input.plan.stateSnapshotId
  ) {
    throw new TypeError(
      "cyber-physical evidence does not identify the execution plan state snapshot",
    );
  }

  const traceWithoutDigest = {
    schema: "gmr.full-system-trace/v1" as const,
    programDefinitionDigest: input.program.definitionDigest,
    canonicalGeometryDigest: input.program.geometryDigest,
    planDigest: input.plan.planDigest,
    machineId: input.plan.machineId,
    stateSnapshotId: input.plan.stateSnapshotId,
    ...(input.engineeringEvidence === undefined
      ? {}
      : { engineeringEvidence: input.engineeringEvidence }),
    ...(input.cyberPhysicalEvidence === undefined
      ? {}
      : { cyberPhysicalEvidence: input.cyberPhysicalEvidence }),
    ...(input.executionObservation === undefined
      ? {}
      : { executionObservation: input.executionObservation }),
  };

  return {
    ...traceWithoutDigest,
    traceDigest: semanticDigest(traceWithoutDigest),
  };
}
