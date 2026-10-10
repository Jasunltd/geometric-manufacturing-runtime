import assert from "node:assert/strict";
import test from "node:test";
import {
  bindExecutionPlan,
  compileMachineModel,
  compileManufacturingProgram,
  compilePhysicalStateSnapshot,
} from "../src/index.js";
import type { Point2 } from "../src/model.js";
import { machineInput, programInput, stateInput } from "./fixtures.js";

function distanceToSegment(
  point: Point2,
  start: Point2,
  end: Point2,
): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  const t = Math.max(
    0,
    Math.min(1, (wx * vx + wy * vy) / lengthSquared),
  );
  const px = start.x + t * vx;
  const py = start.y + t * vy;
  return Math.hypot(point.x - px, point.y - py);
}

function distanceToCapsuleBoundary(
  point: Point2,
  start: Point2,
  end: Point2,
  offsetRadius: number,
): number {
  const radial = distanceToSegment(point, start, end);
  return Math.abs(radial - offsetRadius);
}

test("independent sampled oracle finds no coverage gap for the bounded worn-tool plan", () => {
  const program = compileManufacturingProgram(programInput);
  const machine = compileMachineModel(machineInput);
  const state = compilePhysicalStateSnapshot(stateInput(9.8));
  assert.equal(program._tag, "Compiled");
  assert.equal(machine._tag, "Compiled");
  assert.equal(state._tag, "Compiled");
  if (
    program._tag !== "Compiled" ||
    machine._tag !== "Compiled" ||
    state._tag !== "Compiled"
  ) {
    return;
  }

  const binding = bindExecutionPlan(
    program.value,
    machine.value,
    state.value,
  );
  assert.equal(binding._tag, "Bound");
  if (binding._tag !== "Bound") return;

  const geometry = program.value.geometry[0];
  const compensation = binding.plan.compensation[0];
  assert.ok(geometry);
  assert.ok(compensation);

  const actualRadius = compensation.measuredDiameter / 2;
  const boundaryOffset = compensation.radialDelta;
  const minX = Math.min(geometry.start.x, geometry.end.x) - geometry.radius;
  const maxX = Math.max(geometry.start.x, geometry.end.x) + geometry.radius;
  const minY = Math.min(geometry.start.y, geometry.end.y) - geometry.radius;
  const maxY = Math.max(geometry.start.y, geometry.end.y) + geometry.radius;

  let canonicalSamples = 0;
  let uncoveredSamples = 0;
  const step = 0.25;

  for (let x = minX; x <= maxX + 1e-12; x += step) {
    for (let y = minY; y <= maxY + 1e-12; y += step) {
      const point = { x, y };
      const nominalDistance = distanceToSegment(
        point,
        geometry.start,
        geometry.end,
      );
      if (nominalDistance > geometry.radius + 1e-9) continue;
      canonicalSamples += 1;

      const centerlineCovered = nominalDistance <= actualRadius + 1e-9;
      const boundaryCovered =
        distanceToCapsuleBoundary(
          point,
          geometry.start,
          geometry.end,
          boundaryOffset,
        ) <= actualRadius + 1e-9;

      if (!centerlineCovered && !boundaryCovered) {
        uncoveredSamples += 1;
      }
    }
  }

  assert.ok(canonicalSamples > 1000);
  assert.equal(uncoveredSamples, 0);
});
