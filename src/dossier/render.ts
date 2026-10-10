import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import type { ManufacturingPlan } from "../cam/model.js";
import type { DesignCandidate } from "../design/model.js";
import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import type {
  DossierArtifacts,
  ManufacturingDossier,
} from "./model.js";

const execFileAsync = promisify(execFile);

export class DossierRendererFailure extends Data.TaggedError(
  "DossierRendererFailure",
)<{
  readonly code: string;
  readonly detail: string;
}> {}

export interface DossierRenderer {
  readonly render: (
    candidate: DesignCandidate,
    plan: ManufacturingPlan,
    dossier: ManufacturingDossier,
  ) => Effect.Effect<DossierArtifacts, DossierRendererFailure>;
}

export const DossierRenderer = Context.GenericTag<DossierRenderer>(
  "geometric-manufacturing-runtime/DossierRenderer",
);

export interface ReportlabDossierRendererConfig {
  readonly pythonExecutable: string;
  readonly workerPath: string;
  readonly workRoot: string;
}

async function fileDigest(file: string): Promise<Digest> {
  const bytes = await fs.readFile(file);
  return (
    "sha256:" + createHash("sha256").update(bytes).digest("hex")
  ) as Digest;
}

function parseResult(value: unknown): {
  readonly dossierDigest: Digest;
  readonly reportlabVersion: string;
  readonly artifacts: Record<string, string>;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("dossier worker returned non-object JSON");
  }
  const result = value as Record<string, unknown>;
  if (
    result.schema !== "gmr.dossier-render-result/v1" ||
    typeof result.dossierDigest !== "string" ||
    typeof result.reportlabVersion !== "string" ||
    typeof result.artifacts !== "object" ||
    result.artifacts === null ||
    Array.isArray(result.artifacts)
  ) {
    throw new TypeError("dossier worker result is incomplete");
  }
  const artifacts = result.artifacts as Record<string, unknown>;
  for (const key of [
    "drawingSvg",
    "drawingPdf",
    "dfmPdf",
    "inspectionPdf",
    "metrologyCsv",
    "metrologyPdf",
    "setupSheetPdf",
  ]) {
    if (typeof artifacts[key] !== "string") {
      throw new TypeError("dossier worker artifact missing: " + key);
    }
  }
  return {
    dossierDigest: result.dossierDigest as Digest,
    reportlabVersion: result.reportlabVersion,
    artifacts: artifacts as Record<string, string>,
  };
}

export function reportlabDossierRendererLayer(
  config: ReportlabDossierRendererConfig,
): Layer.Layer<DossierRenderer> {
  return Layer.succeed(
    DossierRenderer,
    DossierRenderer.of({
      render: (candidate, plan, dossier) =>
        Effect.tryPromise({
          try: async () => {
            if (candidate.candidateDigest !== dossier.candidateDigest) {
              throw new TypeError("candidate/dossier digest mismatch");
            }
            if (plan.candidateDigest !== candidate.candidateDigest) {
              throw new TypeError("plan/candidate digest mismatch");
            }
            const outDir = path.join(
              config.workRoot,
              candidate.id + "-" + dossier.dossierDigest.slice(7, 19),
            );
            await fs.mkdir(outDir, { recursive: true });
            const requestPath = path.join(outDir, "render-request.json");
            await fs.writeFile(
              requestPath,
              JSON.stringify(
                {
                  schema: "gmr.dossier-render-request/v1",
                  candidate,
                  manufacturingPlan: plan,
                  dossier,
                },
                null,
                2,
              ) + "\n",
            );
            const { stdout } = await execFileAsync(
              config.pythonExecutable,
              [config.workerPath, requestPath, outDir],
              { maxBuffer: 8 * 1024 * 1024 },
            );
            const raw = parseResult(JSON.parse(stdout.trim()));
            if (raw.dossierDigest !== dossier.dossierDigest) {
              throw new TypeError("dossier worker identity mismatch");
            }
            const artifact = async (key: string) => {
              const artifactPath = raw.artifacts[key]!;
              return {
                path: artifactPath,
                digest: await fileDigest(artifactPath),
              };
            };
            const base = {
              schema: "gmr.manufacturing-dossier-artifacts/v1" as const,
              dossierDigest: dossier.dossierDigest,
              backend: {
                name: "reportlab" as const,
                version: raw.reportlabVersion,
              },
              drawingSvg: await artifact("drawingSvg"),
              drawingPdf: await artifact("drawingPdf"),
              dfmPdf: await artifact("dfmPdf"),
              inspectionPdf: await artifact("inspectionPdf"),
              metrologyCsv: await artifact("metrologyCsv"),
              metrologyPdf: await artifact("metrologyPdf"),
              setupSheetPdf: await artifact("setupSheetPdf"),
            };
            return {
              ...base,
              artifactDigest: semanticDigest(base),
            };
          },
          catch: (cause) =>
            new DossierRendererFailure({
              code: "dossier-render-failed",
              detail: String(cause),
            }),
        }),
    }),
  );
}
