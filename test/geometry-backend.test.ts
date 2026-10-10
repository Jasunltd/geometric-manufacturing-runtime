import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Effect } from "effect";
import {
  GeometryBackend,
  build123dGeometryBackendLayer,
  compileDesignProblem,
  synthesizeDesignSpace,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

const python = path.resolve(".venv/bin/python");
const worker = path.resolve("python/build123d_worker.py");

test(
  "build123d independently realizes the selected semantic candidate",
  { skip: !existsSync(python) },
  async () => {
    const compiled = compileDesignProblem(designProblemInput);
    assert.equal(compiled._tag, "Compiled");
    if (compiled._tag !== "Compiled") return;
    const synthesis = synthesizeDesignSpace(compiled.value);
    const selected = synthesis.feasibleCandidates[0];
    assert.ok(selected);

    const layer = build123dGeometryBackendLayer({
      pythonExecutable: python,
      workerPath: worker,
      workRoot: path.resolve("work/test-build123d"),
    });
    const realize = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const backend = yield* GeometryBackend;
          return yield* backend.realize(selected);
        }).pipe(Effect.provide(layer)),
      );

    const first = await realize();

    assert.equal(first.valid, true);
    assert.equal(first.backend.version, "0.13.0");
    assert.equal(first.backend.mode, "algebra");
    const relativeError =
      Math.abs(first.volumeMm3 - selected.metrics.volumeMm3) /
      first.volumeMm3;
    assert.ok(relativeError < 1e-8);
    assert.equal(first.topology.solids, 1);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = await realize();

    assert.equal(second.realizationDigest, first.realizationDigest);
    assert.equal(second.artifacts.step.digest, first.artifacts.step.digest);
    assert.equal(second.artifacts.stl.digest, first.artifacts.stl.digest);
    assert.equal(second.artifacts.svg.digest, first.artifacts.svg.digest);

    const step = await readFile(second.artifacts.step.path, "utf8");
    assert.match(
      step,
      /FILE_NAME\('Open CASCADE Shape Model','1970-01-01T00:00:00'/,
    );
  },
);
