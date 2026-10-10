import type { Digest, Point2 } from "../model.js";

export type MotionCommand =
  | { readonly _tag: "SetUnits"; readonly units: "mm" }
  | { readonly _tag: "SetPlane"; readonly plane: "XY" }
  | { readonly _tag: "SetDistanceMode"; readonly mode: "absolute" }
  | { readonly _tag: "SetFeedMode"; readonly mode: "units-per-minute" }
  | { readonly _tag: "SetWorkOffset"; readonly offset: "G54" }
  | { readonly _tag: "CutterCompCancel" }
  | {
      readonly _tag: "ToolChange";
      readonly toolNumber: number;
      readonly toolId: string;
    }
  | {
      readonly _tag: "ToolLengthOn";
      readonly toolNumber: number;
      readonly safeZ: number;
    }
  | { readonly _tag: "ToolLengthOff" }
  | {
      readonly _tag: "SpindleOn";
      readonly rpm: number;
      readonly direction: "cw";
    }
  | { readonly _tag: "SpindleOff" }
  | { readonly _tag: "CoolantOn" }
  | { readonly _tag: "CoolantOff" }
  | {
      readonly _tag: "Rapid";
      readonly position: Partial<Readonly<{ x: number; y: number; z: number }>>;
    }
  | {
      readonly _tag: "FeedLinear";
      readonly position: Partial<Readonly<{ x: number; y: number; z: number }>>;
      readonly feedMmPerMin: number;
    }
  | {
      readonly _tag: "DrillCycle";
      readonly point: Point2;
      readonly z: number;
      readonly retractZ: number;
      readonly feedMmPerMin: number;
    }
  | {
      readonly _tag: "BoreCycle";
      readonly point: Point2;
      readonly z: number;
      readonly retractZ: number;
      readonly feedMmPerMin: number;
    }
  | {
      readonly _tag: "CutterCompLeadIn";
      readonly side: "left" | "right";
      readonly register: number;
      readonly end: Point2;
      readonly feedMmPerMin: number;
    }
  | {
      readonly _tag: "CutterCompLeadOut";
      readonly end: Point2;
      readonly feedMmPerMin: number;
    }
  | { readonly _tag: "CancelCannedCycle" }
  | { readonly _tag: "ProgramEnd" };

export interface MotionProgram {
  readonly schema: "gmr.motion-program/v1";
  readonly manufacturingPlanDigest: Digest;
  readonly setupId: string;
  readonly commands: readonly MotionCommand[];
  readonly motionDigest: Digest;
}
