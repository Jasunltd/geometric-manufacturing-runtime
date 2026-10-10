
import { semanticDigest } from "../integrity/canonical.js";
import type { DesignCandidate, DesignProblem } from "../design/model.js";
import type { Point2 } from "../model.js";
import type {
  CamOperation,
  ManufacturingPlan,
  ToolDefinition,
} from "./model.js";

function closedContour(candidate: DesignCandidate): readonly Point2[] {
  const upper = candidate.profile.map((point) => ({
    x: point.xMm,
    y: point.halfWidthMm,
  }));
  const lower = [...candidate.profile]
    .reverse()
    .map((point) => ({
      x: point.xMm,
      y: -point.halfWidthMm,
    }));
  return [...upper, ...lower, upper[0]!];
}

function signedArea(points: readonly Point2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

export function planCandidateManufacturing(
  problem: DesignProblem,
  candidate: DesignCandidate,
): ManufacturingPlan {
  if (candidate.problemDigest !== semanticDigest(problem)) {
    throw new TypeError("candidate was synthesized from a different DesignProblem identity");
  }
  if (candidate.disposition !== "feasible") {
    throw new TypeError("manufacturing plan requires a feasible candidate");
  }

  const mountDiameter = problem.interfaces.mount.mountHoleDiameterMm;
  const boreDiameter = problem.interfaces.payload.boreDiameterMm;
  const profileDiameter = Math.max(
    problem.manufacturing.minimumProfileToolDiameterMm,
    10,
  );

  const tools: readonly ToolDefinition[] = [
    {
      id: "T2.mount-drill",
      number: 2,
      kind: "twist-drill",
      diameterMm: mountDiameter,
      spindleRpm: 3500,
      feedMmPerMin: 240,
      basis:
        "portfolio screening process assumption; verify against actual tool/material/machine before machining",
    },
    {
      id: "T3.finish-bore",
      number: 3,
      kind: "boring-tool",
      diameterMm: boreDiameter,
      spindleRpm: 1800,
      feedMmPerMin: 120,
      basis:
        "portfolio screening process assumption; final bore method/tooling requires shop verification",
    },
    {
      id: "T4.profile",
      number: 4,
      kind: "flat-end-mill",
      diameterMm: profileDiameter,
      spindleRpm: 8000,
      feedMmPerMin: 900,
      basis:
        "portfolio screening process assumption; not a production feed/speed recommendation",
    },
  ];

  const mountPoints = candidate.holes
    .filter((hole) => hole.role === "mount")
    .map((hole) => hole.center);
  const loadHole = candidate.holes.find((hole) => hole.role === "load");
  if (loadHole === undefined) {
    throw new TypeError("candidate lost payload bore");
  }

  const contour = closedContour(candidate);
  const orientation = signedArea(contour);
  const compensation = orientation < 0 ? "left" : "right";
  const depth = candidate.parameters.thicknessMm;

  const operations: readonly CamOperation[] = [
    {
      _tag: "DrillMountPattern",
      id: "OP10.mount-holes",
      toolId: "T2.mount-drill",
      points: mountPoints,
      topZ: 0,
      bottomZ: -depth - 0.5,
      retractZ: 3,
    },
    {
      _tag: "FinishBore",
      id: "OP20.payload-bore",
      toolId: "T3.finish-bore",
      point: loadHole.center,
      diameterMm: loadHole.diameterMm,
      topZ: 0,
      bottomZ: -depth - 0.5,
      retractZ: 3,
    },
    {
      _tag: "ProfileContour",
      id: "OP30.outer-profile",
      toolId: "T4.profile",
      contour,
      topZ: 0,
      bottomZ: -depth - 0.25,
      safeZ: 8,
      compensation,
    },
  ];

  const base = {
    schema: "gmr.manufacturing-plan/v1" as const,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    tools,
    setups: [
      {
        id: "S1.top",
        workOffset: "G54" as const,
        fixture: "sacrificial-fixture-plate" as const,
        clearanceZ: 8,
        operations,
      },
    ],
    assumptions: [
      "One top-side setup assumes a sacrificial fixture plate with clearance beneath through features.",
      "The setup declares an 8 mm positive-Z clearance plane for tool-length activation and inter-operation retracts.",
      "Mount holes are drilled before the exterior profile so the part may be additionally retained through the mounting interface if the shop chooses.",
      "Controller cutter compensation carries the final profile radius relationship; D-register values remain setup/tool-table responsibility.",
      "Feeds, speeds, workholding, stickout, coolant, and prove-out remain shop verification obligations.",
    ],
  };
  return {
    ...base,
    planDigest: semanticDigest(base),
  };
}
