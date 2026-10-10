import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Effect } from "effect";
import {
  DossierRenderer,
  buildManufacturingDossier,
  compileDesignProblem,
  compileMotionProgram,
  planCandidateManufacturing,
  reportlabDossierRendererLayer,
  searchDesign,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function fixture() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") throw new Error("fixture");
  const search = searchDesign(compiled.value);
  assert.ok(search.winner);
  const candidate = search.winner.candidate;
  const plan = planCandidateManufacturing(compiled.value, candidate);
  const motion = compileMotionProgram(plan);
  return { problem: compiled.value, candidate, plan, motion };
}

test("manufacturing dossier binds GD&T, DFM, inspection, metrology, and prove-out to one candidate", () => {
  const { problem, candidate, plan, motion } = fixture();
  const first = buildManufacturingDossier(
    problem,
    candidate,
    plan,
    motion,
  );
  const second = buildManufacturingDossier(
    problem,
    candidate,
    plan,
    motion,
  );

  assert.equal(first.dossierDigest, second.dossierDigest);
  assert.equal(first.drawing.candidateDigest, candidate.candidateDigest);
  assert.equal(first.dfm.disposition, "pass-with-conditions");
  assert.equal(first.proveout.disposition, "pass-with-conditions");
  assert.ok(
    first.drawing.standardReferences.some((value) =>
      value.includes("ASME Y14.5-2018"),
    ),
  );
  assert.deepEqual(
    first.drawing.datums.map((datum) => datum.id),
    ["A", "B", "C"],
  );
  assert.ok(
    first.drawing.geometricRequirements.some(
      (requirement) =>
        requirement.id === "GR-PAYLOAD-POSITION" &&
        requirement.toleranceMm === 0.1,
    ),
  );
  assert.ok(
    first.dfm.checks.some(
      (check) =>
        check.id === "DFM-DATUM-A" &&
        check.disposition === "conditional",
    ),
  );
  assert.equal(
    first.inspection.characteristics.length,
    first.metrology.firstArticle.length,
  );
  assert.ok(
    first.metrology.firstArticle.every(
      (observation) => observation.disposition === "pass",
    ),
  );
  const boreCapability = first.metrology.capability.find(
    (item) => item.characteristicId === "IC-PAYLOAD-BORE-SIZE",
  );
  assert.ok(boreCapability);
  assert.equal(boreCapability.observationsMm.length, 30);
  assert.ok((boreCapability.cp ?? 0) > 0);
  assert.ok((boreCapability.cpk ?? 0) > 0);
  assert.ok(
    first.proveout.checks.some(
      (check) =>
        check.id === "PROVEOUT-RAPID-CLEARANCE" &&
        check.disposition === "pass",
    ),
  );
});

test("dossier compilation refuses mismatched downstream identities", () => {
  const { problem, candidate, plan, motion } = fixture();
  const forgedPlan = {
    ...plan,
    candidateDigest: ("sha256:" + "0".repeat(64)) as typeof plan.candidateDigest,
  };
  assert.throws(
    () =>
      buildManufacturingDossier(
        problem,
        candidate,
        forgedPlan,
        motion,
      ),
    /manufacturing plan belongs to a different candidate/,
  );
});

const python = path.resolve(".venv/bin/python");
const worker = path.resolve("python/manufacturing_dossier_worker.py");
const reportlabAvailable =
  existsSync(python) &&
  spawnSync(python, ["-c", "import reportlab"], {
    stdio: "ignore",
  }).status === 0;

test(
  "ReportLab mechanism emits deterministic drawing and manufacturing packet artifacts",
  { skip: !reportlabAvailable },
  async () => {
    const { problem, candidate, plan, motion } = fixture();
    const dossier = buildManufacturingDossier(
      problem,
      candidate,
      plan,
      motion,
    );
    const layer = reportlabDossierRendererLayer({
      pythonExecutable: python,
      workerPath: worker,
      workRoot: path.resolve("work/test-dossier"),
    });
    const render = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const renderer = yield* DossierRenderer;
          return yield* renderer.render(candidate, plan, dossier);
        }).pipe(Effect.provide(layer)),
      );
    const first = await render();
    const second = await render();
    assert.equal(first.artifactDigest, second.artifactDigest);
    assert.equal(first.drawingPdf.digest, second.drawingPdf.digest);
    assert.equal(first.metrologyCsv.digest, second.metrologyCsv.digest);
    assert.equal(first.backend.version, "5.0.1");

    const pdfHeader = await readFile(first.drawingPdf.path);
    assert.equal(pdfHeader.subarray(0, 4).toString(), "%PDF");
    const csv = await readFile(first.metrologyCsv.path, "utf8");
    assert.match(csv, /first_article,IC-PAYLOAD-BORE-SIZE/);
    assert.match(csv, /synthetic_lot,IC-PAYLOAD-BORE-SIZE,30/);
  },
);
