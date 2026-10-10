
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import { semanticDigest } from "../integrity/canonical.js";
import type { DesignCandidate } from "../design/model.js";
import type { Digest } from "../model.js";
import type { Build123dRealization } from "./model.js";

const execFileAsync = promisify(execFile);

export class GeometryBackendFailure extends Data.TaggedError(
  "GeometryBackendFailure",
)<{
  readonly code: string;
  readonly detail: string;
}> {}

export interface GeometryBackend {
  readonly realize: (
    candidate: DesignCandidate,
  ) => Effect.Effect<Build123dRealization, GeometryBackendFailure>;
}

export const GeometryBackend = Context.GenericTag<GeometryBackend>(
  "geometric-manufacturing-runtime/GeometryBackend",
);

export interface Build123dBackendConfig {
  readonly pythonExecutable: string;
  readonly workerPath: string;
  readonly workRoot: string;
}

async function fileDigest(file: string): Promise<Digest> {
  const bytes = await fs.readFile(file);
  return ("sha256:" +
    createHash("sha256").update(bytes).digest("hex")) as Digest;
}

function parseWorkerResult(value: unknown): {
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly backend: {
    readonly name: "build123d";
    readonly version: string;
    readonly mode: "algebra";
  };
  readonly valid: boolean;
  readonly volumeMm3: number;
  readonly surfaceAreaMm2: number;
  readonly centerOfMassMm: { readonly x: number; readonly y: number; readonly z: number };
  readonly boundingBoxMm: { readonly x: number; readonly y: number; readonly z: number };
  readonly topology: { readonly solids: number; readonly faces: number; readonly edges: number };
  readonly artifacts: { readonly step: string; readonly stl: string; readonly svg: string };
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("build123d worker returned non-object JSON");
  }
  const result = value as Record<string, unknown>;
  if (result.schema !== "gmr.build123d-worker-result/v1") {
    throw new TypeError("unsupported build123d worker result schema");
  }
  const backend = result.backend as Record<string, unknown>;
  const center = result.centerOfMassMm as Record<string, unknown>;
  const bbox = result.boundingBoxMm as Record<string, unknown>;
  const topology = result.topology as Record<string, unknown>;
  const artifacts = result.artifacts as Record<string, unknown>;
  if (
    typeof result.candidateId !== "string" ||
    typeof result.candidateDigest !== "string" ||
    backend?.name !== "build123d" ||
    typeof backend?.version !== "string" ||
    backend?.mode !== "algebra" ||
    typeof result.valid !== "boolean" ||
    typeof result.volumeMm3 !== "number" ||
    typeof result.surfaceAreaMm2 !== "number" ||
    typeof center?.x !== "number" ||
    typeof center?.y !== "number" ||
    typeof center?.z !== "number" ||
    typeof bbox?.x !== "number" ||
    typeof bbox?.y !== "number" ||
    typeof bbox?.z !== "number" ||
    typeof topology?.solids !== "number" ||
    typeof topology?.faces !== "number" ||
    typeof topology?.edges !== "number" ||
    typeof artifacts?.step !== "string" ||
    typeof artifacts?.stl !== "string" ||
    typeof artifacts?.svg !== "string"
  ) {
    throw new TypeError("build123d worker result is incomplete");
  }
  return {
    candidateId: result.candidateId,
    candidateDigest: result.candidateDigest as Digest,
    backend: {
      name: "build123d",
      version: backend.version,
      mode: "algebra",
    },
    valid: result.valid,
    volumeMm3: result.volumeMm3,
    surfaceAreaMm2: result.surfaceAreaMm2,
    centerOfMassMm: { x: center.x, y: center.y, z: center.z },
    boundingBoxMm: { x: bbox.x, y: bbox.y, z: bbox.z },
    topology: {
      solids: topology.solids,
      faces: topology.faces,
      edges: topology.edges,
    },
    artifacts: {
      step: artifacts.step,
      stl: artifacts.stl,
      svg: artifacts.svg,
    },
  };
}

export function build123dGeometryBackendLayer(
  config: Build123dBackendConfig,
): Layer.Layer<GeometryBackend> {
  return Layer.succeed(
    GeometryBackend,
    GeometryBackend.of({
      realize: (candidate) =>
        Effect.tryPromise({
          try: async () => {
            const candidateDir = path.join(
              config.workRoot,
              candidate.id + "-" + candidate.candidateDigest.slice(7, 19),
            );
            await fs.mkdir(candidateDir, { recursive: true });
            const requestPath = path.join(candidateDir, "request.json");
            await fs.writeFile(
              requestPath,
              JSON.stringify(
                {
                  schema: "gmr.build123d-request/v1",
                  candidate,
                },
                null,
                2,
              ) + "\n",
            );
            const { stdout } = await execFileAsync(
              config.pythonExecutable,
              [config.workerPath, requestPath, candidateDir],
              { maxBuffer: 4 * 1024 * 1024 },
            );
            const raw = parseWorkerResult(JSON.parse(stdout.trim()));
            if (raw.candidateDigest !== candidate.candidateDigest) {
              throw new TypeError("geometry worker candidate digest mismatch");
            }
            const artifacts = {
              step: {
                path: raw.artifacts.step,
                digest: await fileDigest(raw.artifacts.step),
              },
              stl: {
                path: raw.artifacts.stl,
                digest: await fileDigest(raw.artifacts.stl),
              },
              svg: {
                path: raw.artifacts.svg,
                digest: await fileDigest(raw.artifacts.svg),
              },
            };
            const base = {
              schema: "gmr.geometry-realization/v1" as const,
              candidateId: raw.candidateId,
              candidateDigest: raw.candidateDigest,
              backend: raw.backend,
              valid: raw.valid,
              volumeMm3: raw.volumeMm3,
              surfaceAreaMm2: raw.surfaceAreaMm2,
              centerOfMassMm: raw.centerOfMassMm,
              boundingBoxMm: raw.boundingBoxMm,
              topology: raw.topology,
              artifacts,
            };
            return {
              ...base,
              realizationDigest: semanticDigest(base),
            };
          },
          catch: (cause) =>
            new GeometryBackendFailure({
              code: "build123d-realization-failed",
              detail: String(cause),
            }),
        }),
    }),
  );
}
