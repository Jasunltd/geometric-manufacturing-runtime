export type ControllerTarget =
  | "generic-rs274"
  | "haas-ngc"
  | "linuxcnc";

export interface ControllerProfile {
  readonly id: string;
  readonly target: ControllerTarget;
  readonly family: string;
  readonly percentDelimited: boolean;
  readonly programNumber?: number;
  readonly programEnd: "M2" | "M30";
  readonly toolChangeMCode: "M6" | "M06";
  readonly spindleClockwiseMCode: "M3" | "M03";
  readonly spindleStopMCode: "M5" | "M05";
  readonly coolantOnMCode: "M8" | "M08";
  readonly coolantOffMCode: "M9" | "M09";
  readonly maxMCommandsPerBlock: number;
  readonly supports: {
    readonly cutterComp: boolean;
    readonly drillCycle: "G81";
    readonly boreCycle: "G85";
    readonly toolLengthComp: "G43";
    readonly toolLengthActivation: "same-block-z" | "separate-rapid-z";
    readonly workOffset: "G54";
  };
  readonly notes: readonly string[];
}

export const GenericRs274Profile: ControllerProfile = {
  id: "generic-rs274-mill-v1",
  target: "generic-rs274",
  family: "RS274-like 3-axis mill",
  percentDelimited: true,
  programEnd: "M30",
  toolChangeMCode: "M06",
  spindleClockwiseMCode: "M03",
  spindleStopMCode: "M05",
  coolantOnMCode: "M08",
  coolantOffMCode: "M09",
  maxMCommandsPerBlock: 1,
  supports: {
    cutterComp: true,
    drillCycle: "G81",
    boreCycle: "G85",
    toolLengthComp: "G43",
    toolLengthActivation: "same-block-z",
    workOffset: "G54",
  },
  notes: [
    "Compatibility target only; not a controller certification profile.",
  ],
};

export const HaasNgcProfile: ControllerProfile = {
  id: "haas-ngc-mill-v1",
  target: "haas-ngc",
  family: "Haas Next Generation Control mill",
  percentDelimited: true,
  programNumber: 1001,
  programEnd: "M30",
  toolChangeMCode: "M06",
  spindleClockwiseMCode: "M03",
  spindleStopMCode: "M05",
  coolantOnMCode: "M08",
  coolantOffMCode: "M09",
  maxMCommandsPerBlock: 1,
  supports: {
    cutterComp: true,
    drillCycle: "G81",
    boreCycle: "G85",
    toolLengthComp: "G43",
    toolLengthActivation: "same-block-z",
    workOffset: "G54",
  },
  notes: [
    "Profile encodes the official Haas rule that only one M-code is allowed per block.",
    "Generated output remains simulation/review material; tools, offsets, workholding, feeds/speeds, and safe prove-out are external obligations.",
  ],
};

export const LinuxCncProfile: ControllerProfile = {
  id: "linuxcnc-rs274-v1",
  target: "linuxcnc",
  family: "LinuxCNC RS274NGC",
  percentDelimited: false,
  programEnd: "M2",
  toolChangeMCode: "M6",
  spindleClockwiseMCode: "M3",
  spindleStopMCode: "M5",
  coolantOnMCode: "M8",
  coolantOffMCode: "M9",
  maxMCommandsPerBlock: 1,
  supports: {
    cutterComp: true,
    drillCycle: "G81",
    boreCycle: "G85",
    toolLengthComp: "G43",
    toolLengthActivation: "separate-rapid-z",
    workOffset: "G54",
  },
  notes: [
    "LinuxCNC target uses documented G81/G85, G41/G42, G43, G54, and M2 semantics.",
    "Tool-length activation is emitted as G43 Hn followed by a separate G00 Z move, matching LinuxCNC RS274 interpreter semantics.",
    "Generated output is verified against LinuxCNC's standalone rs274 interpreter in the recorded portfolio evidence path.",
  ],
};

export function controllerProfile(
  target: ControllerTarget,
): ControllerProfile {
  switch (target) {
    case "generic-rs274":
      return GenericRs274Profile;
    case "haas-ngc":
      return HaasNgcProfile;
    case "linuxcnc":
      return LinuxCncProfile;
  }
}