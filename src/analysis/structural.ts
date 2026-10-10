
import { createHash } from "node:crypto";
import { semanticDigest } from "../integrity/canonical.js";
import type { CompileResult, Digest } from "../model.js";
import type {
  DesignCandidate,
  DesignProblem,
  ProfilePoint,
} from "../design/model.js";

export interface StructuralStudyRequest {
  readonly schema: "gmr.structural-study-request/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly problemDigest: Digest;
  readonly units: "mm-N-MPa";
  readonly geometry: {
    readonly name: string;
    readonly thicknessMm: number;
    readonly halfWidthProfile: readonly ProfilePoint[];
    readonly holes: readonly {
      readonly id: string;
      readonly role: "mount" | "load";
      readonly xMm: number;
      readonly yMm: number;
      readonly diameterMm: number;
    }[];
    readonly supportPlaneXMm: number;
    readonly loadPointXMm: number;
  };
  readonly material: {
    readonly id: string;
    readonly label: string;
    readonly youngsModulusMPa: number;
    readonly poissonRatio: number;
    readonly densityKgPerM3: number;
    readonly basis: string;
  };
  readonly loadCase: {
    readonly id: string;
    readonly loadN: number;
    readonly axis: "z";
    readonly description: string;
  };
  readonly meshSizesMm: readonly number[];
  readonly convergence: {
    readonly displacementRelativeChangeMax: number;
    readonly analyticalToFinestRelativeDeviationMax: number;
  };
  readonly requestDigest: Digest;
}

export type StructuralStudyCompileResult =
  | {
      readonly _tag: "Compiled";
      readonly request: StructuralStudyRequest;
    }
  | {
      readonly _tag: "CompileError";
      readonly code: "candidate-problem-mismatch";
      readonly detail: string;
    }
  | {
      readonly _tag: "Unsupported";
      readonly code: "keepout-holes-not-supported-by-existing-fea-schema";
      readonly detail: string;
    };

export interface StructuralToolchainBinding {
  readonly gmsh: string;
  readonly calculix: string;
}

export interface ExistingFixtureStudyConfig {
  readonly schemaVersion: 1;
  readonly studyId: string;
  readonly units: "mm-N-MPa";
  readonly geometry: StructuralStudyRequest["geometry"];
  readonly material: StructuralStudyRequest["material"];
  readonly loadCase: StructuralStudyRequest["loadCase"];
  readonly meshSizesMm: readonly number[];
  readonly convergence: StructuralStudyRequest["convergence"];
  readonly toolchain: StructuralToolchainBinding;
}

export type StructuralVerificationDisposition =
  | "supports-screening-requirements"
  | "fails-screening-requirements"
  | "inconclusive";

export interface StructuralVerificationBinding {
  readonly schema: "gmr.structural-verification-binding/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly problemDigest: Digest;
  readonly requestDigest: Digest;
  readonly source: {
    readonly schema: "fixture-structural.analysis/v1";
    readonly studyId: string;
    readonly geometryDigest: Digest;
    readonly resultDigest: Digest;
    readonly gmshVersion: string;
    readonly calculixVersion: string;
  };
  readonly observations: {
    readonly finestMeshSizeMm: number;
    readonly loadAverageDisplacementMm: number;
    readonly maxIntegrationPointVonMisesMPa: number;
    readonly staticFactorOfSafetyAgainstDeclaredYield: number;
    readonly displacementConverged: boolean;
    readonly analyticalAgreementWithinDeclaredBand: boolean;
  };
  readonly requirements: {
    readonly maxTipDeflectionMm: number;
    readonly minStaticFactorOfSafety: number;
  };
  readonly disposition: StructuralVerificationDisposition;
  readonly limitations: readonly string[];
  readonly bindingDigest: Digest;
}

function fixtureGeometryDigest(
  request: StructuralStudyRequest,
): Digest {
  const source = JSON.stringify({
    geometry: request.geometry,
    material: request.material,
    loadCase: request.loadCase,
  });
  return (
    "sha256:" + createHash("sha256").update(source).digest("hex")
  ) as Digest;
}

function finite(
  value: unknown,
  label: string,
): CompileResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: label + " must be finite",
    };
  }
  return {
    _tag: "Compiled",
    value,
    digest: semanticDigest(value),
  };
}

export function compileStructuralStudyRequest(
  problem: DesignProblem,
  candidate: DesignCandidate,
): StructuralStudyCompileResult {
  if (candidate.problemDigest !== semanticDigest(problem)) {
    return {
      _tag: "CompileError",
      code: "candidate-problem-mismatch",
      detail: "candidate was synthesized from a different DesignProblem identity",
    };
  }
  const keepouts = candidate.holes.filter((hole) => hole.role === "keepout");
  if (keepouts.length > 0) {
    return {
      _tag: "Unsupported",
      code: "keepout-holes-not-supported-by-existing-fea-schema",
      detail:
        "the existing structural-study schema classifies holes as mount/load only; preserve the keepout in CAD/CAM and extend the FEA schema before claiming correlated geometry",
    };
  }

  const load = problem.loadCases[0]!;
  const base = {
    schema: "gmr.structural-study-request/v1" as const,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    problemDigest: candidate.problemDigest,
    units: "mm-N-MPa" as const,
    geometry: {
      name: "generated tapered plate arm",
      thicknessMm: candidate.parameters.thicknessMm,
      halfWidthProfile: candidate.profile,
      holes: candidate.holes.map((hole) => ({
        id: hole.id,
        role: hole.role as "mount" | "load",
        xMm: hole.center.x,
        yMm: hole.center.y,
        diameterMm: hole.diameterMm,
      })),
      supportPlaneXMm: problem.interfaces.mount.mountHoleXFromDatumMm,
      loadPointXMm: problem.interfaces.payload.axisXFromDatumMm,
    },
    material: {
      id: problem.material.id,
      label: problem.material.label,
      youngsModulusMPa: problem.material.youngsModulusMPa,
      poissonRatio: problem.material.poissonRatio,
      densityKgPerM3: problem.material.densityKgPerM3,
      basis: problem.material.basis,
    },
    loadCase: {
      id: load.id,
      loadN: load.forceN,
      axis: "z" as const,
      description:
        "Generated design-problem load applied at payload interface " +
        problem.interfaces.payload.id +
        ".",
    },
    meshSizesMm: [8, 5, 3.5] as const,
    convergence: {
      displacementRelativeChangeMax: 0.02,
      analyticalToFinestRelativeDeviationMax: 0.2,
    },
  };
  return {
    _tag: "Compiled",
    request: {
      ...base,
      requestDigest: semanticDigest(base),
    },
  };
}

export function bindExistingFixtureStudyToolchain(
  request: StructuralStudyRequest,
  toolchain: StructuralToolchainBinding,
): ExistingFixtureStudyConfig {
  return {
    schemaVersion: 1,
    studyId: request.candidateId,
    units: "mm-N-MPa",
    geometry: request.geometry,
    material: request.material,
    loadCase: request.loadCase,
    meshSizesMm: request.meshSizesMm,
    convergence: request.convergence,
    toolchain,
  };
}

export function bindExistingFixtureStudyResult(
  problem: DesignProblem,
  request: StructuralStudyRequest,
  input: unknown,
): CompileResult<StructuralVerificationBinding> {
  if (
    semanticDigest(problem) !== request.problemDigest
  ) {
    return {
      _tag: "CompileError",
      code: "structural-binding-mismatch",
      detail:
        "problem and structural request do not describe the same design problem",
    };
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "external structural result must be an object",
    };
  }
  const result = input as Record<string, unknown>;
  if (result.schema !== "fixture-structural.analysis/v1") {
    return {
      _tag: "Unsupported",
      code: "unsupported-structural-result-schema",
      detail: "expected fixture-structural.analysis/v1",
    };
  }
  if (result.studyId !== request.candidateId) {
    return {
      _tag: "CompileError",
      code: "structural-study-id-mismatch",
      detail: "external structural result studyId does not match candidate",
    };
  }

  const expectedGeometryDigest = fixtureGeometryDigest(request);
  if (result.geometryDigest !== expectedGeometryDigest) {
    return {
      _tag: "CompileError",
      code: "structural-geometry-digest-mismatch",
      detail:
        "external structural result was not computed from the exact bound geometry/material/load request",
    };
  }

  if (!Array.isArray(result.numerical) || result.numerical.length < 2) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "external structural result requires at least two mesh levels",
    };
  }
  const numerical = result.numerical.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
  if (numerical.length !== result.numerical.length) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "numerical mesh results must be objects",
    };
  }

  const parsed = numerical.map((mesh, index) => {
    const meshSize = finite(mesh.meshSizeMm, "numerical[" + index + "].meshSizeMm");
    if (meshSize._tag !== "Compiled") return meshSize;
    const displacement = finite(
      mesh.loadAverageUzMm,
      "numerical[" + index + "].loadAverageUzMm",
    );
    if (displacement._tag !== "Compiled") return displacement;
    const stress = finite(
      mesh.maxIntegrationPointVonMisesMPa,
      "numerical[" + index + "].maxIntegrationPointVonMisesMPa",
    );
    if (stress._tag !== "Compiled") return stress;
    if (meshSize.value <= 0 || stress.value < 0) {
      return {
        _tag: "CompileError" as const,
        code: "invalid-structural-result",
        detail: "mesh size must be positive and stress non-negative",
      };
    }
    return {
      _tag: "Compiled" as const,
      value: {
        meshSizeMm: meshSize.value,
        loadAverageUzMm: displacement.value,
        maxIntegrationPointVonMisesMPa: stress.value,
      },
      digest: semanticDigest(mesh),
    };
  });
  const failed = parsed.find((item) => item._tag !== "Compiled");
  if (failed !== undefined) return failed;
  const meshes = parsed
    .filter(
      (
        item,
      ): item is Extract<(typeof parsed)[number], { readonly _tag: "Compiled" }> =>
        item._tag === "Compiled",
    )
    .map((item) => item.value)
    .sort((a, b) => a.meshSizeMm - b.meshSizeMm);
  const finest = meshes[0];
  if (finest === undefined) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "no usable numerical mesh result",
    };
  }

  const comparison =
    typeof result.comparison === "object" &&
    result.comparison !== null &&
    !Array.isArray(result.comparison)
      ? (result.comparison as Record<string, unknown>)
      : undefined;
  if (
    comparison === undefined ||
    typeof comparison.displacementConverged !== "boolean" ||
    typeof comparison.analyticalAgreementWithinDeclaredBand !== "boolean"
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "structural comparison/convergence evidence is incomplete",
    };
  }

  const toolchain =
    typeof result.toolchain === "object" &&
    result.toolchain !== null &&
    !Array.isArray(result.toolchain)
      ? (result.toolchain as Record<string, unknown>)
      : undefined;
  if (
    toolchain === undefined ||
    typeof toolchain.gmshVersion !== "string" ||
    typeof toolchain.ccxVersion !== "string"
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-structural-result",
      detail: "structural toolchain identity is incomplete",
    };
  }

  const displacementMm = Math.abs(finest.loadAverageUzMm);
  const factorOfSafety =
    finest.maxIntegrationPointVonMisesMPa === 0
      ? Number.POSITIVE_INFINITY
      : problem.material.yieldStrengthMPa /
        finest.maxIntegrationPointVonMisesMPa;
  const converged = comparison.displacementConverged;
  const agreed = comparison.analyticalAgreementWithinDeclaredBand;
  const disposition: StructuralVerificationDisposition =
    !converged || !agreed
      ? "inconclusive"
      : displacementMm > problem.requirements.maxTipDeflectionMm ||
          factorOfSafety < problem.requirements.minStaticFactorOfSafety
        ? "fails-screening-requirements"
        : "supports-screening-requirements";

  const sourceResultDigest = semanticDigest(input);
  const base = {
    schema: "gmr.structural-verification-binding/v1" as const,
    candidateId: request.candidateId,
    candidateDigest: request.candidateDigest,
    problemDigest: request.problemDigest,
    requestDigest: request.requestDigest,
    source: {
      schema: "fixture-structural.analysis/v1" as const,
      studyId: request.candidateId,
      geometryDigest: expectedGeometryDigest,
      resultDigest: sourceResultDigest,
      gmshVersion: toolchain.gmshVersion,
      calculixVersion: toolchain.ccxVersion,
    },
    observations: {
      finestMeshSizeMm: finest.meshSizeMm,
      loadAverageDisplacementMm: displacementMm,
      maxIntegrationPointVonMisesMPa:
        finest.maxIntegrationPointVonMisesMPa,
      staticFactorOfSafetyAgainstDeclaredYield: factorOfSafety,
      displacementConverged: converged,
      analyticalAgreementWithinDeclaredBand: agreed,
    },
    requirements: {
      maxTipDeflectionMm: problem.requirements.maxTipDeflectionMm,
      minStaticFactorOfSafety:
        problem.requirements.minStaticFactorOfSafety,
    },
    disposition,
    limitations: [
      "Binding preserves the external verifier result; it does not upgrade screening assumptions into production structural approval.",
      "Static factor of safety is a derived screening comparison against the DesignProblem declared yield strength, not a solver-owned acceptance claim.",
      "Existing FEA model-form omissions remain owned by the structural-verification result.",
    ],
  };
  const binding: StructuralVerificationBinding = {
    ...base,
    bindingDigest: semanticDigest(base),
  };
  return {
    _tag: "Compiled",
    value: binding,
    digest: binding.bindingDigest,
  };
}
