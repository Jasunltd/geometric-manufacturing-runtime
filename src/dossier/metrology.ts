import { semanticDigest } from "../integrity/canonical.js";
import type { Digest, Point2 } from "../model.js";
import type {
  CapabilityProjection,
  DrawingSpec,
  FittedCircle,
  FittedPlane,
  FirstArticleObservation,
  InspectionCharacteristic,
  InspectionPlan,
  Point3,
  SimulatedMetrology,
} from "./model.js";

class DeterministicRandom {
  #state: number;

  constructor(seed: Digest) {
    const hex = seed.slice(7, 15);
    this.#state = Number.parseInt(hex, 16) || 0x9e3779b9;
  }

  uniform(): number {
    let x = this.#state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.#state = x >>> 0;
    return this.#state / 0x1_0000_0000;
  }

  normal(): number {
    const u1 = Math.max(this.uniform(), Number.EPSILON);
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

function solve3x3(
  matrix: readonly (readonly number[])[],
  vector: readonly number[],
): readonly [number, number, number] {
  const a = matrix.map((row, index) => [
    ...row,
    vector[index]!,
  ]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row]![pivot]!) > Math.abs(a[best]![pivot]!)) {
        best = row;
      }
    }
    if (Math.abs(a[best]![pivot]!) < 1e-12) {
      throw new TypeError("singular metrology fit");
    }
    [a[pivot], a[best]] = [a[best]!, a[pivot]!];
    const divisor = a[pivot]![pivot]!;
    for (let column = pivot; column < 4; column += 1) {
      a[pivot]![column] = a[pivot]![column]! / divisor;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = a[row]![pivot]!;
      for (let column = pivot; column < 4; column += 1) {
        a[row]![column] =
          a[row]![column]! - factor * a[pivot]![column]!;
      }
    }
  }
  return [a[0]![3]!, a[1]![3]!, a[2]![3]!];
}

export function fitCircle2D(points: readonly Point2[]): FittedCircle {
  if (points.length < 3) {
    throw new TypeError("circle fit requires at least three points");
  }
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sb = 0;
  let sxb = 0;
  let syb = 0;
  for (const point of points) {
    const b = -(point.x * point.x + point.y * point.y);
    sx += point.x;
    sy += point.y;
    sxx += point.x * point.x;
    syy += point.y * point.y;
    sxy += point.x * point.y;
    sb += b;
    sxb += point.x * b;
    syb += point.y * b;
  }
  const [d, e, f] = solve3x3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, points.length],
    ],
    [sxb, syb, sb],
  );
  const center = { x: -d / 2, y: -e / 2 };
  const radiusMm = Math.sqrt(
    Math.max(0, center.x * center.x + center.y * center.y - f),
  );
  const residuals = points.map(
    (point) =>
      Math.hypot(point.x - center.x, point.y - center.y) - radiusMm,
  );
  return {
    center,
    radiusMm,
    diameterMm: 2 * radiusMm,
    radialResidualRangeMm:
      Math.max(...residuals) - Math.min(...residuals),
  };
}

export function fitPlane(points: readonly Point3[]): FittedPlane {
  if (points.length < 3) {
    throw new TypeError("plane fit requires at least three points");
  }
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const point of points) {
    sxx += point.x * point.x;
    syy += point.y * point.y;
    sxy += point.x * point.y;
    sx += point.x;
    sy += point.y;
    sxz += point.x * point.z;
    syz += point.y * point.z;
    sz += point.z;
  }
  const [a, b, c] = solve3x3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, points.length],
    ],
    [sxz, syz, sz],
  );
  const residuals = points.map(
    (point) => point.z - (a * point.x + b * point.y + c),
  );
  return {
    zEqualsAxPlusByPlusC: { a, b, c },
    residualRangeMm:
      Math.max(...residuals) - Math.min(...residuals),
  };
}

function uncertaintyFromResolution(resolutionMm: number): number {
  return (2 * resolutionMm) / Math.sqrt(3);
}

function pass(characteristic: InspectionCharacteristic, value: number): boolean {
  if (characteristic.maximumMm !== undefined) {
    return value <= characteristic.maximumMm + 1e-12;
  }
  if (
    characteristic.lowerLimitMm !== undefined &&
    characteristic.upperLimitMm !== undefined
  ) {
    return (
      value >= characteristic.lowerLimitMm - 1e-12 &&
      value <= characteristic.upperLimitMm + 1e-12
    );
  }
  throw new TypeError(
    "inspection characteristic lacks an executable acceptance bound: " +
      characteristic.id,
  );
}

function circlePoints(
  nominalCenter: Point2,
  actualDiameterMm: number,
  centerDxMm: number,
  centerDyMm: number,
  noiseSigmaMm: number,
  random: DeterministicRandom,
): readonly Point2[] {
  const count = 24;
  const points: Point2[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * 2 * Math.PI;
    const lobing = 0.0015 * Math.cos(3 * angle);
    const radius =
      actualDiameterMm / 2 + lobing + noiseSigmaMm * random.normal();
    points.push({
      x: nominalCenter.x + centerDxMm + radius * Math.cos(angle),
      y: nominalCenter.y + centerDyMm + radius * Math.sin(angle),
    });
  }
  return points;
}

function planePoints(
  noiseSigmaMm: number,
  random: DeterministicRandom,
): readonly Point3[] {
  const points: Point3[] = [];
  for (const x of [0, 20, 40, 60, 80]) {
    for (const y of [-20, -10, 0, 10, 20]) {
      const warp = 0.018 * ((x - 40) / 40) ** 2 - 0.006 * (y / 20) ** 2;
      const tilt = 0.0004 * x - 0.0002 * y;
      points.push({
        x,
        y,
        z: tilt + warp + noiseSigmaMm * random.normal(),
      });
    }
  }
  return points;
}

function firstArticleObservation(
  characteristic: InspectionCharacteristic,
  drawing: DrawingSpec,
  random: DeterministicRandom,
): FirstArticleObservation {
  const uncertainty = uncertaintyFromResolution(characteristic.resolutionMm);
  const size = drawing.sizes.find(
    (item) => item.id === characteristic.sourceRequirementId,
  );
  const geometric = drawing.geometricRequirements.find(
    (item) => item.id === characteristic.sourceRequirementId,
  );

  if (characteristic.id === "IC-A-FLATNESS") {
    const points = planePoints(characteristic.resolutionMm / 3, random);
    const fit = fitPlane(points);
    const measured = fit.residualRangeMm;
    return {
      characteristicId: characteristic.id,
      actualValueMm: 0.022,
      measuredValueMm: measured,
      measurementUncertaintyMm: uncertainty,
      disposition: pass(characteristic, measured) ? "pass" : "fail",
      method: characteristic.method,
      evidence: {
        sampledPointCount: points.length,
        fittedPlane: fit,
      },
    };
  }

  const circleDefinition:
    | {
        readonly nominal: number;
        readonly center: Point2;
        readonly dx: number;
        readonly dy: number;
      }
    | undefined =
    characteristic.id === "IC-MOUNT-UPPER-SIZE"
      ? {
          nominal: 6.64,
          center: { x: 12, y: 15 },
          dx: 0.018,
          dy: -0.011,
        }
      : characteristic.id === "IC-MOUNT-LOWER-SIZE"
        ? {
            nominal: 6.64,
            center: { x: 12, y: -15 },
            dx: -0.014,
            dy: 0.009,
          }
        : characteristic.id === "IC-PAYLOAD-BORE-SIZE" ||
            characteristic.id === "IC-PAYLOAD-BORE-POSITION"
          ? {
              nominal: 16.009,
              center: { x: 70, y: 0 },
              dx: 0.021,
              dy: -0.016,
            }
          : undefined;

  if (circleDefinition !== undefined) {
    const points = circlePoints(
      circleDefinition.center,
      circleDefinition.nominal,
      circleDefinition.dx,
      circleDefinition.dy,
      characteristic.resolutionMm / 4,
      random,
    );
    const fit = fitCircle2D(points);
    const measured =
      characteristic.id === "IC-PAYLOAD-BORE-POSITION"
        ? 2 *
          Math.hypot(
            fit.center.x - circleDefinition.center.x,
            fit.center.y - circleDefinition.center.y,
          )
        : fit.diameterMm;
    return {
      characteristicId: characteristic.id,
      actualValueMm:
        characteristic.id === "IC-PAYLOAD-BORE-POSITION"
          ? 2 * Math.hypot(circleDefinition.dx, circleDefinition.dy)
          : circleDefinition.nominal,
      measuredValueMm: measured,
      measurementUncertaintyMm: uncertainty,
      disposition: pass(characteristic, measured) ? "pass" : "fail",
      method: characteristic.method,
      evidence: {
        sampledPointCount: points.length,
        fittedCircle: fit,
      },
    };
  }

  if (size !== undefined) {
    const actual =
      characteristic.id === "IC-THICKNESS"
        ? size.nominalMm + 0.018
        : size.nominalMm;
    const measured = actual + characteristic.resolutionMm * 0.3 * random.normal();
    return {
      characteristicId: characteristic.id,
      actualValueMm: actual,
      measuredValueMm: measured,
      measurementUncertaintyMm: uncertainty,
      disposition: pass(characteristic, measured) ? "pass" : "fail",
      method: characteristic.method,
    };
  }

  if (geometric !== undefined) {
    const measured =
      characteristic.id === "IC-PROFILE"
        ? 0.118 + 0.003 * random.normal()
        : geometric.toleranceMm * 0.45;
    return {
      characteristicId: characteristic.id,
      actualValueMm: measured,
      measuredValueMm: measured,
      measurementUncertaintyMm: uncertainty,
      disposition: pass(characteristic, measured) ? "pass" : "fail",
      method: characteristic.method,
    };
  }

  throw new TypeError("unsupported first-article characteristic " + characteristic.id);
}

function projectionParameters(characteristic: InspectionCharacteristic): {
  readonly mean: number;
  readonly sigma: number;
} {
  switch (characteristic.id) {
    case "IC-THICKNESS":
      return { mean: 8.015, sigma: 0.028 };
    case "IC-MOUNT-UPPER-SIZE":
    case "IC-MOUNT-LOWER-SIZE":
      return { mean: 6.642, sigma: 0.012 };
    case "IC-PAYLOAD-BORE-SIZE":
      return { mean: 16.009, sigma: 0.0027 };
    case "IC-PAYLOAD-BORE-POSITION":
      return { mean: 0.052, sigma: 0.012 };
    case "IC-A-FLATNESS":
      return { mean: 0.055, sigma: 0.012 };
    case "IC-PROFILE":
      return { mean: 0.115, sigma: 0.028 };
  }
  return {
    mean: characteristic.nominalMm ?? characteristic.maximumMm ?? 0,
    sigma: Math.max(characteristic.resolutionMm * 2, 0.001),
  };
}

function capabilityProjection(
  characteristic: InspectionCharacteristic,
  random: DeterministicRandom,
): CapabilityProjection {
  const count = 30;
  const parameters = projectionParameters(characteristic);
  const values = Array.from(
    { length: count },
    () => parameters.mean + parameters.sigma * random.normal(),
  );
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (count - 1);
  const sampleStdDevMm = Math.sqrt(variance);
  const observedPassRate =
    values.filter((value) => pass(characteristic, value)).length / count;

  const common = {
    characteristicId: characteristic.id,
    sampleCount: count,
    meanMm: mean,
    sampleStdDevMm,
    observedPassRate,
    observationsMm: values,
    basis: "synthetic-model" as const,
    note:
      "Model-based capability projection only; Cp/Cpk become production evidence only when calculated from a stable, representative measured process.",
  };

  if (
    characteristic.lowerLimitMm !== undefined &&
    characteristic.upperLimitMm !== undefined &&
    sampleStdDevMm > 0
  ) {
    const cp =
      (characteristic.upperLimitMm - characteristic.lowerLimitMm) /
      (6 * sampleStdDevMm);
    const cpk = Math.min(
      (characteristic.upperLimitMm - mean) / (3 * sampleStdDevMm),
      (mean - characteristic.lowerLimitMm) / (3 * sampleStdDevMm),
    );
    return { ...common, cp, cpk };
  }
  return common;
}

export function simulateMetrology(
  candidateDigest: Digest,
  drawing: DrawingSpec,
  inspection: InspectionPlan,
): SimulatedMetrology {
  const seed = semanticDigest({
    candidateDigest,
    drawingDigest: drawing.drawingDigest,
    inspectionPlanDigest: inspection.inspectionPlanDigest,
    purpose: "gmr.synthetic-metrology/v1",
  });
  const random = new DeterministicRandom(seed);
  const firstArticle = inspection.characteristics.map((characteristic) =>
    firstArticleObservation(characteristic, drawing, random),
  );
  const capability = inspection.characteristics.map((characteristic) =>
    capabilityProjection(characteristic, random),
  );
  const base = {
    schema: "gmr.simulated-metrology/v1" as const,
    candidateDigest,
    inspectionPlanDigest: inspection.inspectionPlanDigest,
    seed,
    firstArticle,
    capability,
    limitations: [
      "SIMULATED METROLOGY - NOT PHYSICAL MEASUREMENT.",
      "Synthetic deviations and measurement noise are declared portfolio assumptions, not sampled machine behavior.",
      "Measurement uncertainty is a simple expanded resolution contribution (2 * resolution / sqrt(3)); a production uncertainty budget requires the actual gauge, calibration, environment, operator, repeatability, reproducibility, stability, bias, and traceability evidence.",
      "Capability projections use 30 deterministic synthetic observations and are not process qualification or production Cp/Cpk.",
    ],
  };
  return {
    ...base,
    metrologyDigest: semanticDigest(base),
  };
}