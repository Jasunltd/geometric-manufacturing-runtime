import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import {
  DossierRenderer,
  GeometryBackend,
  bindExistingFixtureStudyResult,
  bindLinuxCncRs274Receipt,
  build123dGeometryBackendLayer,
  buildManufacturingDossier,
  compileDesignProblem,
  compileLinuxCncVerificationFixture,
  compileMotionProgram,
  compileStructuralStudyRequest,
  controllerProfile,
  planCandidateManufacturing,
  postMotionProgram,
  reportlabDossierRendererLayer,
  searchDesign,
  synthesizeDesignSpace,
} from "./index.js";

function sha256(bytes: string | Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function prepareVariant(input: {
  readonly root: string;
  readonly problemPath: string;
  readonly structuralResultPath: string;
  readonly linuxCncReceiptPath: string;
  readonly linuxCncCanonicalTracePath: string;
  readonly geometryWorkRoot: string;
  readonly dossierWorkRoot: string;
  readonly maxExpandedStates?: number;
}) {
  const openInput = JSON.parse(
    await fs.readFile(input.problemPath, "utf8"),
  ) as unknown;
  const compiled = compileDesignProblem(openInput);
  if (compiled._tag !== "Compiled") {
    throw new TypeError(
      "DesignProblem compilation failed for " +
        input.problemPath +
        ": " +
        compiled.code +
        " " +
        compiled.detail,
    );
  }

  const search = searchDesign(
    compiled.value,
    input.maxExpandedStates === undefined
      ? {}
      : { maxExpandedStates: input.maxExpandedStates },
  );
  if (search.disposition !== "winner-found" || search.winner === undefined) {
    throw new TypeError(
      "bounded design search failed for " +
        input.problemPath +
        ": " +
        search.disposition,
    );
  }
  const selected = search.winner.candidate;

  const exhaustiveBaseline = synthesizeDesignSpace(compiled.value);
  const exhaustiveWinner = exhaustiveBaseline.feasibleCandidates[0];
  if (
    exhaustiveWinner === undefined ||
    exhaustiveWinner.candidateDigest !== selected.candidateDigest
  ) {
    throw new TypeError(
      "state-conditioned search winner disagrees with exhaustive baseline for " +
        input.problemPath,
    );
  }

  const geometryLayer = build123dGeometryBackendLayer({
    pythonExecutable: path.join(input.root, ".venv", "bin", "python"),
    workerPath: path.join(input.root, "python", "build123d_worker.py"),
    workRoot: input.geometryWorkRoot,
  });
  const realization = await Effect.runPromise(
    Effect.gen(function* () {
      const geometry = yield* GeometryBackend;
      return yield* geometry.realize(selected);
    }).pipe(Effect.provide(geometryLayer)),
  );
  if (!realization.valid) {
    throw new TypeError("build123d returned an invalid solid");
  }

  const volumeRelativeError =
    Math.abs(realization.volumeMm3 - selected.metrics.volumeMm3) /
    Math.max(Math.abs(realization.volumeMm3), Number.EPSILON);
  if (volumeRelativeError > 1e-8) {
    throw new TypeError(
      "independent build123d volume disagrees with semantic candidate by " +
        volumeRelativeError,
    );
  }

  const structural = compileStructuralStudyRequest(
    compiled.value,
    selected,
  );
  if (structural._tag !== "Compiled") {
    throw new TypeError(
      "structural adapter refused selected candidate: " +
        structural.detail,
    );
  }

  const recordedStructuralResult = JSON.parse(
    await fs.readFile(input.structuralResultPath, "utf8"),
  ) as unknown;
  const structuralVerification = bindExistingFixtureStudyResult(
    compiled.value,
    structural.request,
    recordedStructuralResult,
  );
  if (structuralVerification._tag !== "Compiled") {
    throw new TypeError(
      "recorded structural verification no longer binds: " +
        structuralVerification.code +
        " " +
        structuralVerification.detail,
    );
  }

  const manufacturingPlan = planCandidateManufacturing(
    compiled.value,
    selected,
  );
  const motion = compileMotionProgram(manufacturingPlan);
  const posted = compiled.value.manufacturing.controllerTargets.map(
    (target) =>
      postMotionProgram(
        motion,
        controllerProfile(target),
      ),
  );

  const linuxCncProgram = posted.find(
    (program) => program.target === "linuxcnc",
  );
  if (linuxCncProgram === undefined) {
    throw new TypeError("demo requires a LinuxCNC target for interpreter verification");
  }
  const linuxCncFixture = compileLinuxCncVerificationFixture(
    manufacturingPlan,
    motion,
    linuxCncProgram,
  );
  const recordedLinuxCncReceipt = JSON.parse(
    await fs.readFile(input.linuxCncReceiptPath, "utf8"),
  ) as unknown;
  const linuxCncVerification = bindLinuxCncRs274Receipt(
    linuxCncProgram,
    linuxCncFixture,
    recordedLinuxCncReceipt,
  );
  if (linuxCncVerification._tag !== "Compiled") {
    throw new TypeError(
      "recorded LinuxCNC rs274 verification no longer binds: " +
        linuxCncVerification.code +
        " " +
        linuxCncVerification.detail,
    );
  }
  const linuxCncCanonicalTrace = await fs.readFile(
    input.linuxCncCanonicalTracePath,
    "utf8",
  );
  const canonicalTraceDigest = sha256(linuxCncCanonicalTrace);
  const canonicalTraceLineCount = linuxCncCanonicalTrace
    .split("\n")
    .filter((line) => line.length > 0).length;
  if (
    canonicalTraceDigest !==
      linuxCncVerification.value.canonicalOutputSha256 ||
    canonicalTraceLineCount !==
      linuxCncVerification.value.canonicalOutputLineCount
  ) {
    throw new TypeError(
      "recorded LinuxCNC canonical trace does not match its interpreter receipt",
    );
  }

  const dossier = buildManufacturingDossier(
    compiled.value,
    selected,
    manufacturingPlan,
    motion,
  );
  const dossierLayer = reportlabDossierRendererLayer({
    pythonExecutable: path.join(input.root, ".venv", "bin", "python"),
    workerPath: path.join(
      input.root,
      "python",
      "manufacturing_dossier_worker.py",
    ),
    workRoot: input.dossierWorkRoot,
  });
  const dossierArtifacts = await Effect.runPromise(
    Effect.gen(function* () {
      const renderer = yield* DossierRenderer;
      return yield* renderer.render(
        selected,
        manufacturingPlan,
        dossier,
      );
    }).pipe(Effect.provide(dossierLayer)),
  );

  return {
    problem: compiled.value,
    search,
    exhaustiveBaseline,
    exhaustiveWinner,
    selected,
    realization,
    volumeRelativeError,
    structural: structural.request,
    structuralVerification: structuralVerification.value,
    manufacturingPlan,
    motion,
    posted,
    linuxCncFixture,
    linuxCncVerification: linuxCncVerification.value,
    linuxCncCanonicalTrace,
    dossier,
    dossierArtifacts,
  };
}

function summarizedAction(action: {
  readonly _tag: string;
  readonly addresses: readonly string[];
} & Record<string, unknown>) {
  return {
    tag: action._tag,
    ...("fromMm" in action && "toMm" in action
      ? { fromMm: action.fromMm, toMm: action.toMm }
      : {}),
    ...("lengthMm" in action ? { lengthMm: action.lengthMm } : {}),
    addresses: action.addresses,
  };
}

async function copyDossierArtifact(
  artifactDir: string,
  prefix: string,
  source: string,
  name: string,
): Promise<void> {
  await fs.copyFile(source, path.join(artifactDir, prefix + name));
}

async function writeVariantArtifacts(
  artifactDir: string,
  prefix: string,
  variant: Awaited<ReturnType<typeof prepareVariant>>,
): Promise<void> {
  await writeJson(
    path.join(artifactDir, prefix + "design-problem.json"),
    variant.problem,
  );
  await writeJson(
    path.join(artifactDir, prefix + "design-search.json"),
    variant.search,
  );
  await writeJson(
    path.join(artifactDir, prefix + "synthesis-baseline.json"),
    variant.exhaustiveBaseline,
  );
  await writeJson(
    path.join(artifactDir, prefix + "selected-candidate.json"),
    variant.selected,
  );
  await writeJson(
    path.join(artifactDir, prefix + "geometry-realization.json"),
    variant.realization,
  );
  await writeJson(
    path.join(artifactDir, prefix + "structural-study-request.json"),
    variant.structural,
  );
  await writeJson(
    path.join(
      artifactDir,
      prefix + "structural-verification-binding.json",
    ),
    variant.structuralVerification,
  );
  await writeJson(
    path.join(artifactDir, prefix + "manufacturing-plan.json"),
    variant.manufacturingPlan,
  );
  await writeJson(
    path.join(artifactDir, prefix + "motion-program.json"),
    variant.motion,
  );
  await writeJson(
    path.join(artifactDir, prefix + "linuxcnc-verification-fixture.json"),
    variant.linuxCncFixture,
  );
  await writeJson(
    path.join(artifactDir, prefix + "linuxcnc-interpreter-binding.json"),
    variant.linuxCncVerification,
  );
  await fs.writeFile(
    path.join(artifactDir, prefix + "linuxcnc-rs274.canonical.txt"),
    variant.linuxCncCanonicalTrace,
  );
  await writeJson(
    path.join(artifactDir, prefix + "manufacturing-dossier.json"),
    variant.dossier,
  );
  await writeJson(
    path.join(
      artifactDir,
      prefix + "manufacturing-dossier-artifacts.json",
    ),
    variant.dossierArtifacts,
  );

  const dossierCopies = [
    [variant.dossierArtifacts.drawingSvg.path, "engineering-drawing.svg"],
    [variant.dossierArtifacts.drawingPdf.path, "engineering-drawing.pdf"],
    [variant.dossierArtifacts.dfmPdf.path, "dfm-report.pdf"],
    [variant.dossierArtifacts.inspectionPdf.path, "inspection-plan.pdf"],
    [variant.dossierArtifacts.metrologyCsv.path, "simulated-metrology.csv"],
    [variant.dossierArtifacts.metrologyPdf.path, "simulated-metrology.pdf"],
    [variant.dossierArtifacts.setupSheetPdf.path, "setup-sheet.pdf"],
  ] as const;
  for (const [source, name] of dossierCopies) {
    await copyDossierArtifact(artifactDir, prefix, source, name);
  }

  for (const program of variant.posted) {
    const suffix =
      program.target === "haas-ngc"
        ? "haas.ngc"
        : program.target === "linuxcnc"
          ? "linuxcnc.ngc"
          : "generic.ngc";
    const stem = prefix.length === 0 ? "sensor-bracket." : prefix;
    await fs.writeFile(
      path.join(artifactDir, stem + suffix),
      program.text,
    );
    await writeJson(
      path.join(artifactDir, stem + suffix + ".trace.json"),
      {
        target: program.target,
        profileId: program.profileId,
        motionDigest: program.motionDigest,
        artifactDigest: program.artifactDigest,
        trace: program.trace,
      },
    );
  }
}

function summarizeVariant(
  variant: Awaited<ReturnType<typeof prepareVariant>>,
) {
  const firstArticlePass =
    variant.dossier.metrology.firstArticle.filter(
      (item) => item.disposition === "pass",
    ).length;
  return {
    problemDigest: variant.search.problemDigest,
    designSearch: {
      searchDigest: variant.search.searchDigest,
      disposition: variant.search.disposition,
      expandedStateCount: variant.search.expandedStateCount,
      generatedStateCount: variant.search.generatedStateCount,
      exploredEdgeCount: variant.search.edges.length,
      winningActions: variant.search.winningPath.map((edge) =>
        summarizedAction(
          edge.action as typeof edge.action & Record<string, unknown>,
        ),
      ),
    },
    exhaustiveBaseline: {
      synthesisDigest: variant.exhaustiveBaseline.synthesisDigest,
      candidateCount: variant.exhaustiveBaseline.candidates.length,
      feasibleCandidateCount:
        variant.exhaustiveBaseline.feasibleCandidates.length,
      selectedCandidateId:
        variant.exhaustiveBaseline.selectedCandidateId,
      agreesWithSearch:
        variant.exhaustiveWinner.candidateDigest ===
        variant.selected.candidateDigest,
    },
    selectedCandidate: {
      id: variant.selected.id,
      digest: variant.selected.candidateDigest,
      family: variant.selected.family,
      ...(variant.selected.rootButtress === undefined
        ? {}
        : { rootButtress: variant.selected.rootButtress }),
      parameters: variant.selected.parameters,
      metrics: variant.selected.metrics,
    },
    geometry: {
      realizationDigest: variant.realization.realizationDigest,
      build123dVersion: variant.realization.backend.version,
      volumeRelativeError: variant.volumeRelativeError,
      step: variant.realization.artifacts.step,
      svg: variant.realization.artifacts.svg,
    },
    structuralVerification: {
      requestDigest: variant.structural.requestDigest,
      bindingDigest: variant.structuralVerification.bindingDigest,
      sourceResultDigest:
        variant.structuralVerification.source.resultDigest,
      sourceGeometryDigest:
        variant.structuralVerification.source.geometryDigest,
      toolchain: {
        gmsh: variant.structuralVerification.source.gmshVersion,
        calculix:
          variant.structuralVerification.source.calculixVersion,
      },
      observations: variant.structuralVerification.observations,
      disposition: variant.structuralVerification.disposition,
    },
    manufacturingPlanDigest: variant.manufacturingPlan.planDigest,
    motionDigest: variant.motion.motionDigest,
    controllerPrograms: variant.posted.map((program) => ({
      target: program.target,
      profileId: program.profileId,
      artifactDigest: program.artifactDigest,
    })),
    linuxCncInterpreterVerification: {
      fixtureDigest: variant.linuxCncFixture.fixtureDigest,
      bindingDigest: variant.linuxCncVerification.bindingDigest,
      linuxCncVersion: variant.linuxCncVerification.linuxCncVersion,
      interpreter: variant.linuxCncVerification.interpreter,
      disposition: variant.linuxCncVerification.disposition,
      packageSha256: variant.linuxCncVerification.packageSha256,
      canonicalOutputSha256:
        variant.linuxCncVerification.canonicalOutputSha256,
      canonicalOutputLineCount:
        variant.linuxCncVerification.canonicalOutputLineCount,
    },
    manufacturingDossier: {
      dossierDigest: variant.dossier.dossierDigest,
      artifactDigest: variant.dossierArtifacts.artifactDigest,
      drawingDigest: variant.dossier.drawing.drawingDigest,
      dfmDisposition: variant.dossier.dfm.disposition,
      proveoutDisposition: variant.dossier.proveout.disposition,
      firstArticlePassCount: firstArticlePass,
      firstArticleCharacteristicCount:
        variant.dossier.metrology.firstArticle.length,
      reportlabVersion: variant.dossierArtifacts.backend.version,
      simulatedCapabilityCharacteristics:
        variant.dossier.metrology.capability.length,
    },
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const artifactDir = path.join(root, "artifacts", "sensor-bracket-v1");
  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });

  const flagship = await prepareVariant({
    root,
    problemPath: path.join(
      root,
      "examples",
      "sensor-bracket.design-problem.json",
    ),
    structuralResultPath: path.join(
      root,
      "examples",
      "sensor-bracket.structural-analysis.recorded.json",
    ),
    linuxCncReceiptPath: path.join(
      root,
      "examples",
      "sensor-bracket.linuxcnc-rs274.recorded.json",
    ),
    linuxCncCanonicalTracePath: path.join(
      root,
      "examples",
      "sensor-bracket.linuxcnc-rs274.canonical.txt",
    ),
    geometryWorkRoot: path.join(artifactDir, "geometry"),
    dossierWorkRoot: path.join(artifactDir, "dossier-work"),
  });

  const topologyProbe = await prepareVariant({
    root,
    problemPath: path.join(
      root,
      "examples",
      "sensor-bracket-topology-probe.design-problem.json",
    ),
    structuralResultPath: path.join(
      root,
      "examples",
      "sensor-bracket-topology-probe.structural-analysis.recorded.json",
    ),
    linuxCncReceiptPath: path.join(
      root,
      "examples",
      "sensor-bracket-topology-probe.linuxcnc-rs274.recorded.json",
    ),
    linuxCncCanonicalTracePath: path.join(
      root,
      "examples",
      "sensor-bracket-topology-probe.linuxcnc-rs274.canonical.txt",
    ),
    geometryWorkRoot: path.join(artifactDir, "topology-probe-geometry"),
    dossierWorkRoot: path.join(
      artifactDir,
      "topology-probe-dossier-work",
    ),
    maxExpandedStates: 32,
  });

  await writeVariantArtifacts(artifactDir, "", flagship);
  await writeVariantArtifacts(
    artifactDir,
    "topology-probe.",
    topologyProbe,
  );

  const summary = {
    schema: "gmr.demo-summary/v6",
    flagship: summarizeVariant(flagship),
    topologyProbe: summarizeVariant(topologyProbe),
    limitations: [
      "The first topology-changing action is a retained in-plane root buttress that the existing plate-stock geometry, variable-width FEA model, and 3-axis contour CAM can all represent exactly; a vertical 3D rib is intentionally not claimed.",
      "The drawing/GD&T packet is a portfolio engineering definition referenced to current ASME Y14 practices; it is explicitly not a production release and requires design-authority review before manufacture.",
      "Metrology and capability results are deterministic synthetic evidence, not physical measurements or process qualification.",
      "Virtual prove-out replays typed motion state and machine-envelope endpoints; LinuxCNC 2.9.8 rs274 acceptance is recorded for the exact emitted LinuxCNC program/metric-machine/tool-table fixture, while CAMotics material-removal visualization remains optional. Neither replaces physical prove-out.",
      "Structural verification is consumed as recorded, digest-bound evidence from the separate structural-verification owner; the default demo does not rerun Gmsh/CalculiX.",
      "Structural screening and the recorded FEA models omit production-specific preload/contact/material/process effects; this is not production structural approval.",
      "CAM is a bounded 2.5D portfolio planner, not a production-certified postprocessor.",
      "Feeds, speeds, workholding, tool offsets, controller output, measurement equipment, and physical machining require shop verification.",
    ],
  };
  await writeJson(path.join(artifactDir, "summary.json"), summary);

  const manifestEntries: {
    readonly file: string;
    readonly digest: string;
  }[] = [];
  const topFiles = await fs.readdir(artifactDir, {
    withFileTypes: true,
  });
  for (const entry of topFiles) {
    if (!entry.isFile() || entry.name === "MANIFEST.sha256") continue;
    const file = path.join(artifactDir, entry.name);
    const bytes = await fs.readFile(file);
    manifestEntries.push({
      file: entry.name,
      digest: sha256(bytes),
    });
  }
  manifestEntries.sort((a, b) => a.file.localeCompare(b.file));
  await fs.writeFile(
    path.join(artifactDir, "MANIFEST.sha256"),
    manifestEntries
      .map(
        (entry) =>
          entry.digest.slice(7) + "  " + entry.file,
      )
      .join("\n") + "\n",
  );

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

await main();