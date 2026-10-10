import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractFiles = [
  "contracts/deep-module-program-v1.json",
  "contracts/deep-module-execution-v1.json",
  "contracts/deep-module-repl-v1.json",
  "contracts/deep-module-integration-v1.json",
  "contracts/deep-module-design-v2.json",
  "contracts/deep-module-design-search-v2.json",
  "contracts/deep-module-geometry-v2.json",
  "contracts/deep-module-analysis-v2.json",
  "contracts/deep-module-cam-v2.json",
  "contracts/deep-module-motion-v2.json",
  "contracts/deep-module-controller-v2.json",
  "contracts/deep-module-dossier-v2.json",
  "contracts/deep-module-repl-v2.json",
  "contracts/deep-module-recovery-v2.json",
  "contracts/deep-module-recovery-report-v2.json",
] as const;

test("deep-module contracts preserve small public surfaces", async () => {
  for (const path of contractFiles) {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      schema: string;
      authority: string;
      public: { exports: readonly { name: string; arity: number }[] };
      depth: { maxPublicSymbols: number; maxArgsPerExport: number };
    };

    assert.equal(
      parsed.schema,
      "agent-workbench.deep-module-contract/v1",
    );
    assert.equal(parsed.authority, "none");
    assert.ok(
      parsed.public.exports.length <= parsed.depth.maxPublicSymbols,
    );
    for (const symbol of parsed.public.exports) {
      assert.ok(symbol.arity <= parsed.depth.maxArgsPerExport);
    }
  }
});