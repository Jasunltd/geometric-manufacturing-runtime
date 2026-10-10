import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Context, Data, Effect, Layer } from "effect";
import { semanticDigest } from "../integrity/canonical.js";
import type { Digest } from "../model.js";
import type {
  ProcessRecoveryCaseStudy,
  ProcessRecoveryCaseStudyArtifacts,
} from "./model.js";

const execFileAsync = promisify(execFile);

export class RecoveryRendererFailure extends Data.TaggedError(
  "RecoveryRendererFailure",
)<{
  readonly code: string;
  readonly detail: string;
}> {}

export interface RecoveryRenderer {
  readonly render: (
    study: ProcessRecoveryCaseStudy,
  ) => Effect.Effect<
    ProcessRecoveryCaseStudyArtifacts,
    RecoveryRendererFailure
  >;
}

export const RecoveryRenderer = Context.GenericTag<RecoveryRenderer>(
  "geometric-manufacturing-runtime/RecoveryRenderer",
);

export interface ReportlabRecoveryRendererConfig {
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
  readonly caseStudyDigest: Digest;
  readonly reportlabVersion: string;
  readonly reportPdf: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("recovery renderer returned non-object JSON");
  }
  const result = value as Record<string, unknown>;
  if (
    result.schema !== "gmr.process-recovery-render-result/v1" ||
    typeof result.caseStudyDigest !== "string" ||
    typeof result.reportlabVersion !== "string" ||
    typeof result.reportPdf !== "string"
  ) {
    throw new TypeError("recovery renderer result is incomplete");
  }
  return {
    caseStudyDigest: result.caseStudyDigest as Digest,
    reportlabVersion: result.reportlabVersion,
    reportPdf: result.reportPdf,
  };
}

export function reportlabRecoveryRendererLayer(
  config: ReportlabRecoveryRendererConfig,
): Layer.Layer<RecoveryRenderer> {
  return Layer.succeed(
    RecoveryRenderer,
    RecoveryRenderer.of({
      render: (study) =>
        Effect.tryPromise({
          try: async () => {
            const outDir = path.join(
              config.workRoot,
              study.scenarioId + "-" + study.caseStudyDigest.slice(7, 19),
            );
            await fs.mkdir(outDir, { recursive: true });
            const inputPath = path.join(outDir, "case-study.json");
            await fs.writeFile(
              inputPath,
              JSON.stringify(study, null, 2) + "\n",
            );
            const { stdout } = await execFileAsync(
              config.pythonExecutable,
              [config.workerPath, inputPath, outDir],
              { maxBuffer: 4 * 1024 * 1024 },
            );
            const raw = parseResult(JSON.parse(stdout.trim()));
            if (raw.caseStudyDigest !== study.caseStudyDigest) {
              throw new TypeError("recovery renderer identity mismatch");
            }
            const reportPdf = {
              path: raw.reportPdf,
              digest: await fileDigest(raw.reportPdf),
            };
            const base = {
              schema:
                "gmr.process-recovery-case-study-artifacts/v1" as const,
              caseStudyDigest: study.caseStudyDigest,
              backend: {
                name: "reportlab" as const,
                version: raw.reportlabVersion,
              },
              reportPdf,
            };
            return {
              ...base,
              artifactDigest: semanticDigest(base),
            };
          },
          catch: (cause) =>
            new RecoveryRendererFailure({
              code: "recovery-render-failed",
              detail: String(cause),
            }),
        }),
    }),
  );
}
