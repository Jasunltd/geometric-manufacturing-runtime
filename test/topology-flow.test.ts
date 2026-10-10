import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Effect } from "effect";
import {
  GeometryBackend,
  HaasNgcProfile,
  LinuxCncProfile,
  bindExistingFixtureStudyResult,
  build123dGeometryBackendLayer,
  compileDesignProblem,
  compileMotionProgram,
  compileStructuralStudyRequest,
  planCandidateManufacturing,
  postMotionProgram,
  searchDesign,
} from "../src/index.js";

const python = path.resolve(".venv/bin/python");
const worker = path.resolve("python/build123d_worker.py");

test(
  "root-buttress topology survives CAD, FEA evidence, CAM, Motion IR, and controller lowering",
  { skip: !existsSync(python) },
  async () => {
    const input = JSON.parse(
      await readFile(
        "examples/sensor-bracket-topology-probe.design-problem.json",
        "utf8",
      ),
    ) as unknown;
    const compiled = compileDesignProblem(input);
    assert.equal(compiled._tag, "Compiled");
    if (compiled._tag !== "Compiled") return;

    const search = searchDesign(compiled.value, {
      maxExpandedStates: 32,
    });
    assert.equal(search.disposition, "winner-found");
    assert.ok(search.winner);
    assert.deepEqual(
      search.winningPath.map((edge) => edge.action._tag),
      ["AddRootButtress", "ExtendRootButtress"],
    );

    const winner = search.winner.candidate;
    assert.equal(winner.family, "root-buttressed-plate-arm");
    assert.equal(winner.rootButtress?.lengthMm, 12);

    const layer = build123dGeometryBackendLayer({
      pythonExecutable: python,
      workerPath: worker,
      workRoot: path.resolve("work/test-topology-build123d"),
    });
    const realization = await Effect.runPromise(
      Effect.gen(function* () {
        const backend = yield* GeometryBackend;
        return yield* backend.realize(winner);
      }).pipe(Effect.provide(layer)),
    );
    assert.equal(realization.valid, true);
    const volumeRelativeError =
      Math.abs(realization.volumeMm3 - winner.metrics.volumeMm3) /
      realization.volumeMm3;
    assert.ok(volumeRelativeError < 1e-8);

    const request = compileStructuralStudyRequest(
      compiled.value,
      winner,
    );
    assert.equal(request._tag, "Compiled");
    if (request._tag !== "Compiled") return;

    const recorded = JSON.parse(
      await readFile(
        "examples/sensor-bracket-topology-probe.structural-analysis.recorded.json",
        "utf8",
      ),
    ) as unknown;
    const binding = bindExistingFixtureStudyResult(
      compiled.value,
      request.request,
      recorded,
    );
    assert.equal(binding._tag, "Compiled");
    if (binding._tag !== "Compiled") return;
    assert.equal(
      binding.value.disposition,
      "supports-screening-requirements",
    );
    assert.ok(
      binding.value.observations.loadAverageDisplacementMm <=
        compiled.value.requirements.maxTipDeflectionMm,
    );

    const manufacturing = planCandidateManufacturing(
      compiled.value,
      winner,
    );
    const profile = manufacturing.setups[0]?.operations.find(
      (operation) => operation._tag === "ProfileContour",
    );
    assert.ok(profile);
    if (profile?._tag === "ProfileContour") {
      assert.equal(profile.contour.length, 11);
    }

    const motion = compileMotionProgram(manufacturing);
    const haas = postMotionProgram(motion, HaasNgcProfile);
    const linux = postMotionProgram(motion, LinuxCncProfile);
    assert.equal(haas.motionDigest, linux.motionDigest);
    assert.match(haas.text, /G01 G41 D04/);
    assert.match(linux.text, /G01 G41 D04/);
  },
);
