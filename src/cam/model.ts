import type { Digest, Point2 } from "../model.js";

export interface ToolDefinition {
  readonly id: string;
  readonly number: number;
  readonly kind: "twist-drill" | "boring-tool" | "flat-end-mill";
  readonly diameterMm: number;
  readonly spindleRpm: number;
  readonly feedMmPerMin: number;
  readonly basis: string;
}

export type CamOperation =
  | {
      readonly _tag: "DrillMountPattern";
      readonly id: string;
      readonly toolId: string;
      readonly points: readonly Point2[];
      readonly topZ: number;
      readonly bottomZ: number;
      readonly retractZ: number;
    }
  | {
      readonly _tag: "FinishBore";
      readonly id: string;
      readonly toolId: string;
      readonly point: Point2;
      readonly diameterMm: number;
      readonly topZ: number;
      readonly bottomZ: number;
      readonly retractZ: number;
    }
  | {
      readonly _tag: "ProfileContour";
      readonly id: string;
      readonly toolId: string;
      readonly contour: readonly Point2[];
      readonly topZ: number;
      readonly bottomZ: number;
      readonly safeZ: number;
      readonly compensation: "left" | "right";
    };

export interface CamSetup {
  readonly id: string;
  readonly workOffset: "G54";
  readonly fixture:
    | "sacrificial-fixture-plate"
    | "soft-jaw-envelope";
  readonly clearanceZ: number;
  readonly operations: readonly CamOperation[];
}

export interface ManufacturingPlan {
  readonly schema: "gmr.manufacturing-plan/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly tools: readonly ToolDefinition[];
  readonly setups: readonly CamSetup[];
  readonly assumptions: readonly string[];
  readonly planDigest: Digest;
}
