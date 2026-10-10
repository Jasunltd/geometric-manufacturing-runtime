import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LinuxCncProfile,
  bindLinuxCncRs274Receipt,
  compileDesignProblem,
  compileLinuxCncVerificationFixture,
  compileMotionProgram,
  planCandidateManufacturing,
  postMotionProgram,
  searchDesign,
} from "../src/index.js";
import { designProblemInput } from "./fixtures.js";

function fixture(input: unknown, maxExpandedStates = 256) {
  const compiled = compileDesignProblem(input);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") throw new Error("fixture");
  const search = searchDesign(compiled.value, { maxExpandedStates });
  assert.ok(search.winner);
  const candidate = search.winner.candidate;
  const plan = planCandidateManufacturing(compiled.value, candidate);
  const motion = compileMotionProgram(plan);
  const program = postMotionProgram(motion, LinuxCncProfile);
  const verification = compileLinuxCncVerificationFixture(
    plan,
    motion,
    program,
  );
  return { plan, motion, program, verification };
}

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text).digest("hex");
}

test("LinuxCNC verification fixture declares metric machine/tool-table semantics", () => {
  const first = fixture(designProblemInput);
  const second = fixture(designProblemInput);
  assert.equal(
    first.verification.fixtureDigest,
    second.verification.fixtureDigest,
  );
  assert.match(
    first.verification.machineIni.text,
    /LINEAR_UNITS = mm/,
  );
  assert.match(first.verification.toolTable.text, /T4 P4 Z0 D10/);
  assert.match(first.program.text, /G43 H02\nG00 Z8/);
  assert.doesNotMatch(first.program.text, /G43 H02 Z8/);
});

test("recorded LinuxCNC 2.9.8 rs274 evidence binds to the exact flagship and topology programs", async () => {
  const topologyInput = JSON.parse(
    await readFile(
      "examples/sensor-bracket-topology-probe.design-problem.json",
      "utf8",
    ),
  ) as unknown;

  const cases = [
    {
      name: "flagship",
      system: fixture(designProblemInput),
      receipt:
        "examples/sensor-bracket.linuxcnc-rs274.recorded.json",
      canonical:
        "examples/sensor-bracket.linuxcnc-rs274.canonical.txt",
      expectedLines: 126,
      requiredTrace: "STRAIGHT_FEED(0.0000, 29.0000, -8.2500",
    },
    {
      name: "topology",
      system: fixture(topologyInput, 32),
      receipt:
        "examples/sensor-bracket-topology-probe.linuxcnc-rs274.recorded.json",
      canonical:
        "examples/sensor-bracket-topology-probe.linuxcnc-rs274.canonical.txt",
      expectedLines: 130,
      requiredTrace: "STRAIGHT_FEED(36.7600, 29.0000, -6.2500",
    },
  ] as const;

  for (const item of cases) {
    const receipt = JSON.parse(
      await readFile(item.receipt, "utf8"),
    ) as unknown;
    const trace = await readFile(item.canonical, "utf8");

    const bound = bindLinuxCncRs274Receipt(
      item.system.program,
      item.system.verification,
      receipt,
    );
    assert.equal(bound._tag, "Compiled", item.name);
    if (bound._tag !== "Compiled") continue;

    assert.equal(bound.value.linuxCncVersion, "2.9.8");
    assert.equal(bound.value.interpreter, "rs274");
    assert.equal(
      bound.value.canonicalOutputSha256,
      sha256(trace),
      item.name,
    );
    assert.equal(
      bound.value.canonicalOutputLineCount,
      item.expectedLines,
      item.name,
    );
    assert.ok(trace.includes(item.requiredTrace), item.name);
  }
});

test("recorded rs274 receipt is refused after fixture identity tampering", async () => {
  const { program, verification } = fixture(designProblemInput);
  const receipt = JSON.parse(
    await readFile(
      "examples/sensor-bracket.linuxcnc-rs274.recorded.json",
      "utf8",
    ),
  ) as Record<string, unknown>;

  const tampered = bindLinuxCncRs274Receipt(
    program,
    verification,
    {
      ...receipt,
      fixtureDigest: "sha256:" + "0".repeat(64),
    },
  );
  assert.equal(tampered._tag, "CompileError");
  if (tampered._tag === "CompileError") {
    assert.equal(
      tampered.code,
      "linuxcnc-rs274-receipt-identity-mismatch",
    );
  }
});
