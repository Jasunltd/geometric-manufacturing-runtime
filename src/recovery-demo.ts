import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import {
  RecoveryRenderer,
  compileDesignProblem,
  planCandidateManufacturing,
  renderRecoveryCaseStudyMarkdown,
  reportlabRecoveryRendererLayer,
  runProcessRecoveryScenario,
  searchDesign,
} from "./index.js";

function sha256(bytes: string | Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

async function main(): Promise<void> {
  const root = process.cwd();
  const artifactDir = path.join(root, "artifacts", "process-recovery");
  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });

  const problemInput = JSON.parse(
    await fs.readFile(
      path.join(root, "examples", "sensor-bracket.design-problem.json"),
      "utf8",
    ),
  ) as unknown;
  const compiled = compileDesignProblem(problemInput);
  if (compiled._tag !== "Compiled") {
    throw new TypeError(
      "recovery demo DesignProblem compilation failed: " +
        compiled.detail,
    );
  }
  const search = searchDesign(compiled.value);
  if (search.winner === undefined) {
    throw new TypeError("recovery demo requires a feasible candidate");
  }
  const plan = planCandidateManufacturing(
    compiled.value,
    search.winner.candidate,
  );

  const scenarioDir = path.join(root, "examples", "recovery");
  const scenarioFiles = (await fs.readdir(scenarioDir))
    .filter((name) => name.endsWith(".json"))
    .sort();

  const rendererLayer = reportlabRecoveryRendererLayer({
    pythonExecutable: path.join(root, ".venv", "bin", "python"),
    workerPath: path.join(root, "python", "process_recovery_worker.py"),
    workRoot: path.join(artifactDir, "render-work"),
  });

  const summaries = [];
  for (const scenarioFile of scenarioFiles) {
    const input = JSON.parse(
      await fs.readFile(path.join(scenarioDir, scenarioFile), "utf8"),
    ) as unknown;
    const study = runProcessRecoveryScenario(plan, input);
    const markdown = renderRecoveryCaseStudyMarkdown(study);
    const rendered = await Effect.runPromise(
      Effect.gen(function* () {
        const renderer = yield* RecoveryRenderer;
        return yield* renderer.render(study);
      }).pipe(Effect.provide(rendererLayer)),
    );

    const stem = study.scenarioId;
    await writeJson(
      path.join(artifactDir, stem + ".case-study.json"),
      study,
    );
    await fs.writeFile(
      path.join(artifactDir, stem + ".case-study.md"),
      markdown,
    );
    await fs.copyFile(
      rendered.reportPdf.path,
      path.join(artifactDir, stem + ".case-study.pdf"),
    );
    await writeJson(
      path.join(artifactDir, stem + ".artifacts.json"),
      rendered,
    );

    summaries.push({
      scenarioId: study.scenarioId,
      title: study.title,
      caseStudyDigest: study.caseStudyDigest,
      diagnosis: study.assessment.diagnosis,
      observationSources: [
        ...new Set(study.observations.map((item) => item.source.kind)),
      ],
      recommendedAction: study.application.action._tag,
      beforeStateDigest: study.initialState.stateDigest,
      afterStateDigest: study.application.after.stateDigest,
      verification: study.verification.disposition,
      reportPdfDigest: rendered.reportPdf.digest,
    });
  }

  const summary = {
    schema: "gmr.process-recovery-demo-summary/v1",
    candidateId: search.winner.candidate.id,
    candidateDigest: search.winner.candidate.candidateDigest,
    manufacturingPlanDigest: plan.planDigest,
    caseStudyCount: summaries.length,
    caseStudies: summaries,
    limitations: [
      "All five exception scenarios use deterministic simulated observations; they exercise the same intake/diagnosis/action/verification semantics intended for future real machine, metrology, and human feedback.",
      "Human corrections are compiled observations and cannot directly mutate process state or bypass diagnosis/evidence gates.",
      "Machine-driven compensation is blocked when the referenced measurement system is quarantined or evidence is insufficient.",
      "Recovery thresholds and correction bounds are portfolio hypotheses, not production control limits.",
      "Physical release still requires validated sensors/gauges, machine-specific limits, approved control plans, and real process evidence.",
    ],
  };
  await writeJson(path.join(artifactDir, "summary.json"), summary);

  const topFiles = (await fs.readdir(artifactDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== "MANIFEST.sha256")
    .map((entry) => entry.name)
    .sort();
  const manifest = [];
  for (const name of topFiles) {
    const bytes = await fs.readFile(path.join(artifactDir, name));
    manifest.push({
      file: name,
      digest: sha256(bytes),
    });
  }
  await fs.writeFile(
    path.join(artifactDir, "MANIFEST.sha256"),
    manifest
      .map((item) => item.digest.slice(7) + "  " + item.file)
      .join("\n") + "\n",
  );

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

await main();
