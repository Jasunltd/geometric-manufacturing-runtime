import assert from "node:assert/strict";
import test from "node:test";
import {
  compileManufacturingProgram,
  inspectGeneratedGeometry,
} from "../src/index.js";
import { programInput } from "./fixtures.js";

test("tool geometry generates the capsule radius and volume", () => {
  const compiled = compileManufacturingProgram(programInput);
  assert.equal(compiled._tag, "Compiled");
  if (compiled._tag !== "Compiled") return;

  const geometry = inspectGeneratedGeometry(compiled.value, "OP1");
  assert.ok(geometry);
  assert.equal(geometry.radius, 5);
  assert.equal(geometry.width, 10);
  assert.equal(geometry.pathLength, 60);

  const expectedArea = 60 * 10 + Math.PI * 25;
  const expectedVolume = expectedArea * 2;
  assert.ok(Math.abs(geometry.planarArea - expectedArea) < 1e-10);
  assert.ok(Math.abs(geometry.removedVolume - expectedVolume) < 1e-10);
});

test("canonical compilation is deterministic", () => {
  const first = compileManufacturingProgram(programInput);
  const second = compileManufacturingProgram(
    JSON.parse(JSON.stringify(programInput)),
  );
  assert.equal(first._tag, "Compiled");
  assert.equal(second._tag, "Compiled");
  if (first._tag !== "Compiled" || second._tag !== "Compiled") return;

  assert.equal(first.value.definitionDigest, second.value.definitionDigest);
  assert.equal(first.value.geometryDigest, second.value.geometryDigest);
});

test("generated radius cannot be authored independently", () => {
  const withIndependentRadius = {
    ...programInput,
    operations: [
      {
        ...programInput.operations[0],
        radius: 123,
      },
    ],
  };
  const compiled = compileManufacturingProgram(withIndependentRadius);
  assert.equal(compiled._tag, "CompileError");
  if (compiled._tag === "CompileError") {
    assert.equal(
      compiled.code,
      "independent-generated-dimension-forbidden",
    );
  }
});

test("changing the generating tool changes the canonical geometry", () => {
  const original = compileManufacturingProgram(programInput);
  const smaller = compileManufacturingProgram({
    ...programInput,
    tools: [
      {
        ...programInput.tools[0],
        nominalDiameter: 8,
      },
    ],
  });

  assert.equal(original._tag, "Compiled");
  assert.equal(smaller._tag, "Compiled");
  if (original._tag !== "Compiled" || smaller._tag !== "Compiled") return;

  assert.notEqual(
    original.value.geometryDigest,
    smaller.value.geometryDigest,
  );
  assert.equal(smaller.value.geometry[0]?.radius, 4);
});
