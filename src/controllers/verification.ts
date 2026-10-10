import { createHash } from "node:crypto";
import type { ManufacturingPlan } from "../cam/model.js";
import { semanticDigest } from "../integrity/canonical.js";
import type { CompileResult, Digest } from "../model.js";
import type { MotionProgram } from "../motion/model.js";
import type { ControllerProgram } from "./post.js";

function sha256Text(text: string): Digest {
  return (
    "sha256:" + createHash("sha256").update(text).digest("hex")
  ) as Digest;
}

function fmt(value: number): string {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return normalized
    .toFixed(9)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

export interface LinuxCncVerificationFixture {
  readonly schema: "gmr.linuxcnc-verification-fixture/v1";
  readonly candidateDigest: Digest;
  readonly manufacturingPlanDigest: Digest;
  readonly motionDigest: Digest;
  readonly controllerArtifactDigest: Digest;
  readonly ncTextSha256: Digest;
  readonly machineIni: {
    readonly text: string;
    readonly sha256: Digest;
    readonly linearUnits: "mm";
  };
  readonly toolTable: {
    readonly text: string;
    readonly sha256: Digest;
  };
  readonly fixtureDigest: Digest;
}

export interface LinuxCncRs274RecordedReceipt {
  readonly schema: "gmr.linuxcnc-rs274-recorded/v1";
  readonly fixtureDigest: Digest;
  readonly controllerArtifactDigest: Digest;
  readonly ncTextSha256: Digest;
  readonly source: {
    readonly interpreter: "rs274";
    readonly linuxCncVersion: string;
    readonly packageSha256: Digest;
    readonly packageSource: string;
    readonly containerBase: string;
    readonly containerBaseDigest: string;
  };
  readonly execution: {
    readonly command: string;
    readonly exitCode: 0;
    readonly canonicalOutputSha256: Digest;
    readonly canonicalOutputLineCount: number;
  };
  readonly disposition: "accepted";
  readonly limitations: readonly string[];
}

export interface LinuxCncInterpreterVerificationBinding {
  readonly schema: "gmr.linuxcnc-interpreter-verification-binding/v1";
  readonly fixtureDigest: Digest;
  readonly controllerArtifactDigest: Digest;
  readonly motionDigest: Digest;
  readonly sourceReceiptDigest: Digest;
  readonly linuxCncVersion: string;
  readonly interpreter: "rs274";
  readonly packageSha256: Digest;
  readonly canonicalOutputSha256: Digest;
  readonly canonicalOutputLineCount: number;
  readonly disposition: "accepted";
  readonly limitations: readonly string[];
  readonly bindingDigest: Digest;
}

export function compileLinuxCncVerificationFixture(
  plan: ManufacturingPlan,
  motion: MotionProgram,
  program: ControllerProgram,
): LinuxCncVerificationFixture {
  if (program.target !== "linuxcnc") {
    throw new TypeError("LinuxCNC verification requires a linuxcnc controller program");
  }
  if (motion.manufacturingPlanDigest !== plan.planDigest) {
    throw new TypeError("motion program belongs to a different manufacturing plan");
  }
  if (program.motionDigest !== motion.motionDigest) {
    throw new TypeError("controller program belongs to a different MotionProgram");
  }

  const machineIniText = [
    "[TRAJ]",
    "COORDINATES = X Y Z",
    "LINEAR_UNITS = mm",
    "ANGULAR_UNITS = degree",
    "",
  ].join("\n");
  const toolTableText =
    [...plan.tools]
      .sort((left, right) => left.number - right.number)
      .map(
        (tool) =>
          "T" +
          tool.number +
          " P" +
          tool.number +
          " Z0 D" +
          fmt(tool.diameterMm) +
          " ; " +
          tool.id,
      )
      .join("\n") + "\n";

  const base = {
    schema: "gmr.linuxcnc-verification-fixture/v1" as const,
    candidateDigest: plan.candidateDigest,
    manufacturingPlanDigest: plan.planDigest,
    motionDigest: motion.motionDigest,
    controllerArtifactDigest: program.artifactDigest,
    ncTextSha256: sha256Text(program.text),
    machineIni: {
      text: machineIniText,
      sha256: sha256Text(machineIniText),
      linearUnits: "mm" as const,
    },
    toolTable: {
      text: toolTableText,
      sha256: sha256Text(toolTableText),
    },
  };
  return {
    ...base,
    fixtureDigest: semanticDigest(base),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function digest(value: unknown): Digest | undefined {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value)
    ? (value as Digest)
    : undefined;
}

export function bindLinuxCncRs274Receipt(
  program: ControllerProgram,
  fixture: LinuxCncVerificationFixture,
  input: unknown,
): CompileResult<LinuxCncInterpreterVerificationBinding> {
  if (
    program.target !== "linuxcnc" ||
    fixture.controllerArtifactDigest !== program.artifactDigest ||
    fixture.motionDigest !== program.motionDigest ||
    fixture.ncTextSha256 !== sha256Text(program.text)
  ) {
    return {
      _tag: "CompileError",
      code: "linuxcnc-verification-input-mismatch",
      detail: "program and LinuxCNC verification fixture identities do not match",
    };
  }

  const source = record(input);
  const receiptSource = source === undefined ? undefined : record(source.source);
  const execution = source === undefined ? undefined : record(source.execution);
  const limitations =
    source !== undefined && Array.isArray(source.limitations)
      ? source.limitations
      : undefined;
  const fixtureDigest = source === undefined ? undefined : digest(source.fixtureDigest);
  const artifactDigest =
    source === undefined ? undefined : digest(source.controllerArtifactDigest);
  const ncTextSha256 = source === undefined ? undefined : digest(source.ncTextSha256);
  const packageSha256 =
    receiptSource === undefined ? undefined : digest(receiptSource.packageSha256);
  const outputSha256 =
    execution === undefined ? undefined : digest(execution.canonicalOutputSha256);

  if (
    source?.schema !== "gmr.linuxcnc-rs274-recorded/v1" ||
    fixtureDigest === undefined ||
    artifactDigest === undefined ||
    ncTextSha256 === undefined ||
    receiptSource?.interpreter !== "rs274" ||
    typeof receiptSource.linuxCncVersion !== "string" ||
    receiptSource.linuxCncVersion.length === 0 ||
    packageSha256 === undefined ||
    typeof receiptSource.packageSource !== "string" ||
    typeof receiptSource.containerBase !== "string" ||
    typeof receiptSource.containerBaseDigest !== "string" ||
    execution?.exitCode !== 0 ||
    typeof execution.command !== "string" ||
    outputSha256 === undefined ||
    !Number.isInteger(execution.canonicalOutputLineCount) ||
    (execution.canonicalOutputLineCount as number) <= 0 ||
    source.disposition !== "accepted" ||
    limitations === undefined ||
    !limitations.every((item) => typeof item === "string")
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-linuxcnc-rs274-receipt",
      detail: "recorded LinuxCNC rs274 receipt is incomplete or invalid",
    };
  }
  if (
    fixtureDigest !== fixture.fixtureDigest ||
    artifactDigest !== program.artifactDigest ||
    ncTextSha256 !== fixture.ncTextSha256
  ) {
    return {
      _tag: "CompileError",
      code: "linuxcnc-rs274-receipt-identity-mismatch",
      detail: "recorded LinuxCNC receipt does not bind to the exact verification fixture/program",
    };
  }

  const receipt = input as LinuxCncRs274RecordedReceipt;
  const base = {
    schema: "gmr.linuxcnc-interpreter-verification-binding/v1" as const,
    fixtureDigest: fixture.fixtureDigest,
    controllerArtifactDigest: program.artifactDigest,
    motionDigest: program.motionDigest,
    sourceReceiptDigest: semanticDigest(receipt),
    linuxCncVersion: receipt.source.linuxCncVersion,
    interpreter: "rs274" as const,
    packageSha256: receipt.source.packageSha256,
    canonicalOutputSha256: receipt.execution.canonicalOutputSha256,
    canonicalOutputLineCount: receipt.execution.canonicalOutputLineCount,
    disposition: "accepted" as const,
    limitations: receipt.limitations,
  };
  const value: LinuxCncInterpreterVerificationBinding = {
    ...base,
    bindingDigest: semanticDigest(base),
  };
  return {
    _tag: "Compiled",
    value,
    digest: value.bindingDigest,
  };
}