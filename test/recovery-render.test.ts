import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { Effect } from "effect";
import {
  RecoveryRenderer,
  compileDesignProblem,
  planCandidateManufacturing,
  reportlabRecoveryRendererLayer,
  runProcessRecoveryScenario,
  searchDesign,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

const python = path.resolve(".venv/bin/python");
const worker = path.resolve("python/process_recovery_worker.py");
const reportlabAvailable =
  existsSync(python) &&
  spawnSync(python, ["-c", "import reportlab"], {
    stdio: "ignore",
  }).status === 0;

function planFixture() {
  const compiled = compileDesignProblem(designProblemInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") throw new Error("fixture");
  const search = searchDesign(compiled.value);
  assert.ok(search.winner);
  return planCandidateManufacturing(
    compiled.value,
    search.winner.candidate,
  );
}

test(
  "ReportLab recovery renderer emits deterministic standalone case-study PDFs",
  { skip: !reportlabAvailable },
  async () => {
    const plan = planFixture();
    const input = JSON.parse(
      await readFile(
        "examples/recovery/03-chatter-stickout.json",
        "utf8",
      ),
    ) as unknown;
    const study = runProcessRecoveryScenario(plan, input);
    const layer = reportlabRecoveryRendererLayer({
      pythonExecutable: python,
      workerPath: worker,
      workRoot: path.resolve("work/test-recovery-report"),
    });
    const render = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const renderer = yield* RecoveryRenderer;
          return yield* renderer.render(study);
        }).pipe(Effect.provide(layer)),
      );
    const first = await render();
    const second = await render();
    assert.equal(first.artifactDigest, second.artifactDigest);
    assert.equal(first.reportPdf.digest, second.reportPdf.digest);
    assert.equal(first.backend.version, "5.0.1");
    const bytes = await readFile(first.reportPdf.path);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  },
);
