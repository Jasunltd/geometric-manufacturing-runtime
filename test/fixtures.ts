
export const programInput = {
  schema: "gmr.program/v1",
  id: "capsule-demo",
  units: "mm",
  stock: {
    kind: "box",
    sizeX: 100,
    sizeY: 60,
    sizeZ: 12,
  },
  tools: [
    {
      kind: "flat-end-mill",
      id: "T1",
      nominalDiameter: 10,
    },
  ],
  operations: [
    {
      kind: "capsule-sweep",
      id: "OP1",
      toolId: "T1",
      start: { x: 20, y: 30 },
      end: { x: 80, y: 30 },
      topZ: 0,
      bottomZ: -2,
      maxRadialCompensation: 0.5,
    },
  ],
} as const;

export const machineInput = {
  schema: "gmr.machine/v1",
  id: "SIM-3AXIS",
  units: "mm",
  axes: ["X", "Y", "Z"],
  workEnvelope: {
    x: { min: 0, max: 120 },
    y: { min: 0, max: 80 },
    z: { min: -20, max: 50 },
  },
  safeZ: 10,
  feedMmPerMin: 600,
  supportsCircularInterpolation: true,
} as const;

export function stateInput(
  measuredDiameter = 9.8,
  snapshotId = "state-1",
) {
  return {
    schema: "gmr.physical-state/v1",
    snapshotId,
    machineId: "SIM-3AXIS",
    workOffset: "G54",
    toolMeasurements: [
      {
        toolId: "T1",
        measuredDiameter,
      },
    ],
    freshness: {
      state: "current",
      observedAt: "2026-10-04T18:00:00Z",
    },
  } as const;
}

export const designProblemInput = {
  schema: "gmr.design-problem/v1",
  id: "sensor-bracket-v1",
  units: "mm-N-MPa",
  interfaces: {
    mount: {
      id: "machine-frame-mount",
      datum: "A",
      mountHoleDiameterMm: 6.6,
      mountHoleXFromDatumMm: 12,
      mountHoleSpacingMm: 30,
    },
    payload: {
      id: "sensor-bore",
      boreDiameterMm: 16,
      axisXFromDatumMm: 70,
      endMarginMm: 15,
    },
  },
  keepOuts: [],
  loadCases: [
    {
      id: "LC-SENSOR-120N",
      interfaceId: "sensor-bore",
      forceN: -120,
      axis: "z",
    },
  ],
  requirements: {
    maxTipDeflectionMm: 0.08,
    minStaticFactorOfSafety: 2,
    minEdgeDistanceMm: 4,
    maxMassG: 250,
  },
  material: {
    id: "al-6061-t6-screening",
    label: "6061-T6 aluminum screening properties",
    youngsModulusMPa: 68900,
    poissonRatio: 0.33,
    densityKgPerM3: 2700,
    yieldStrengthMPa: 276,
    basis:
      "Nominal portfolio screening values; final design requires source-controlled material allowables and process-specific verification.",
  },
  manufacturing: {
    process: "three-axis-milling",
    maxSetups: 2,
    minimumProfileToolDiameterMm: 6,
    stock: {
      kind: "plate",
      maxXmm: 100,
      maxYmm: 70,
      maxZmm: 12,
    },
    controllerTargets: ["haas-ngc", "linuxcnc"],
  },
  grammar: {
    family: "tapered-plate-arm",
    thicknessMm: { min: 6, max: 12, step: 2 },
    rootHalfWidthMm: { min: 24, max: 30, step: 3 },
    armHalfWidthMm: { min: 14, max: 22, step: 2 },
    tipHalfWidthMm: { min: 14, max: 22, step: 2 },
    rootButtressLengthMm: { min: 8, max: 20, step: 4 },
  },
  objectives: [
    { kind: "minimize-mass", priority: 1 },
    { kind: "minimize-cycle-proxy", priority: 2 },
  ],
} as const;
