import { createHash } from "node:crypto";
import type { Digest } from "../model.js";

type CanonicalScalar = null | boolean | number | string;
type CanonicalValue =
  | CanonicalScalar
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function normalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical values require finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child === undefined) {
        throw new TypeError(`canonical values do not permit undefined at ${key}`);
      }
      result[key] = normalize(child);
    }
    return result;
  }

  throw new TypeError(`unsupported canonical value type: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function semanticDigest(value: unknown): Digest {
  const hash = createHash("sha256").update(canonicalJson(value)).digest("hex");
  return `sha256:${hash}`;
}
