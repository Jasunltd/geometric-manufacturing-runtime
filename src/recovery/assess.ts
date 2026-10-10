import type { ManufacturingPlan } from "../cam/model.js";
import { semanticDigest } from "../integrity/canonical.js";
import type {
  ProcessControlState,
  ProcessObservation,
  RecoveryAction,
  RecoveryAssessment,
  RecoveryVerification,
} from "./model.js";

function observationDigest(observation: ProcessObservation) {
  return semanticDigest(observation);
}

function measurementTrusted(
  state: ProcessControlState,
  systemId: string,
): boolean {
  return (
    state.measurementSystems.find((item) => item.systemId === systemId)
      ?.disposition === "trusted"
  );
}

function assessment(
  state: ProcessControlState,
  observations: readonly ProcessObservation[],
  input: Omit<
    RecoveryAssessment,
    | "schema"
    | "candidateDigest"
    | "manufacturingPlanDigest"
    | "controlStateDigest"
    | "observationDigests"
    | "assessmentDigest"
  >,
): RecoveryAssessment {
  const base = {
    schema: "gmr.recovery-assessment/v1" as const,
    candidateDigest: state.candidateDigest,
    manufacturingPlanDigest: state.manufacturingPlanDigest,
    controlStateDigest: state.stateDigest,
    observationDigests: observations.map(observationDigest),
    ...input,
  };
  return {
    ...base,
    assessmentDigest: semanticDigest(base),
  };
}

function dimensionalTrendAssessment(
  state: ProcessControlState,
  observation: Extract<
    ProcessObservation,
    { readonly kind: "dimensional-trend" }
  >,
): RecoveryAssessment | undefined {
  if (!measurementTrusted(state, observation.measurementSystemId)) {
    return assessment(state, [observation], {
      diagnosis: "measurement-system-inadequate",
      evidenceQuality: "measurement-system-untrusted",
      evidence: [
        "Dimensional trend was supplied by quarantined measurement system " +
          observation.measurementSystemId +
          ".",
        "Machining compensation is prohibited until the measurement system is restored.",
      ],
      allowedActions: [
        {
          id: "REC-HOLD-UNTRUSTED-MEASUREMENT",
          _tag: "SetProcessHold",
          hold: true,
          reason:
            "measurement system " +
            observation.measurementSystemId +
            " is not trusted",
        },
      ],
      recommendedActionId: "REC-HOLD-UNTRUSTED-MEASUREMENT",
      disposition: "hold-measurement-system",
    });
  }

  const values = observation.valuesMm;
  const first = values[0]!;
  const last = values.at(-1)!;
  const width = observation.upperLimitMm - observation.lowerLimitMm;
  const monotonicDown = values.every(
    (value, index) =>
      index === 0 || value <= values[index - 1]! + 0.0005,
  );
  const lowerMargin = last - observation.lowerLimitMm;
  const drift = first - last;
  if (
    observation.characteristicId === "IC-PAYLOAD-BORE-SIZE" &&
    monotonicDown &&
    drift >= Math.max(0.004, width * 0.2) &&
    lowerMargin <= width * 0.25
  ) {
    const target =
      observation.lowerLimitMm +
      (observation.upperLimitMm - observation.lowerLimitMm) / 2;
    const rawCorrection = target - last;
    const correction = Math.min(0.01, Math.max(0.001, rawCorrection));
    const action: RecoveryAction = {
      id: "REC-BORE-WEAR-COMP",
      _tag: "AdjustToolDiameter",
      toolId: "T3.finish-bore",
      deltaMm: Number(correction.toFixed(6)),
      basis:
        "Trusted bore trend is monotonically approaching the lower size limit; apply a bounded diameter correction and remeasure before release.",
    };
    return assessment(state, [observation], {
      diagnosis: "tool-wear-drift",
      evidenceQuality: "sufficient",
      evidence: [
        "Bore series decreased from " +
          first.toFixed(3) +
          " to " +
          last.toFixed(3) +
          " mm.",
        "Last measurement is " +
          lowerMargin.toFixed(3) +
          " mm above the lower specification limit.",
        "Measurement system " +
          observation.measurementSystemId +
          " is currently trusted.",
      ],
      allowedActions: [action],
      recommendedActionId: action.id,
      disposition: "action-recommended",
    });
  }
  return undefined;
}

function fixtureAssessment(
  state: ProcessControlState,
  observations: readonly ProcessObservation[],
): RecoveryAssessment | undefined {
  const fixture = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "fixture-distortion" }
    > => item.kind === "fixture-distortion",
  );
  if (fixture === undefined) return undefined;
  if (!measurementTrusted(state, fixture.measurementSystemId)) {
    return undefined;
  }
  const humanClamp = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "human-correction" }
    > =>
      item.kind === "human-correction" &&
      item.field === "clamp-force-scale",
  );
  const actualClamp =
    humanClamp?.correctedValue ?? fixture.clampForceScale;
  const distortion =
    fixture.clampedFlatnessMm - fixture.unclampedFlatnessMm;
  if (
    fixture.unclampedFlatnessMm <= 0.15 &&
    fixture.clampedFlatnessMm > 0.15 &&
    distortion >= 0.05
  ) {
    const target = Math.max(0.55, Math.min(0.75, actualClamp * 0.6));
    const action: RecoveryAction = {
      id: "REC-REDUCE-CLAMP-FORCE",
      _tag: "SetClampForceScale",
      from: actualClamp,
      to: Number(target.toFixed(3)),
      basis:
        "Part is acceptable unclamped but fails flatness while clamped; reduce clamp load and remeasure before machining.",
    };
    return assessment(state, observations, {
      diagnosis: "clamp-induced-distortion",
      evidenceQuality: "sufficient",
      evidence: [
        "Unclamped flatness " +
          fixture.unclampedFlatnessMm.toFixed(3) +
          " mm is acceptable.",
        "Clamped flatness " +
          fixture.clampedFlatnessMm.toFixed(3) +
          " mm exceeds the 0.150 mm portfolio limit.",
        "Clamping adds " + distortion.toFixed(3) + " mm of apparent distortion.",
        ...(humanClamp === undefined
          ? []
          : [
              "Human setup correction changed clamp-force scale from " +
                humanClamp.previousValue.toFixed(3) +
                " to observed " +
                humanClamp.correctedValue.toFixed(3) +
                ".",
            ]),
      ],
      allowedActions: [action],
      recommendedActionId: action.id,
      disposition: "action-recommended",
    });
  }
  return undefined;
}

function chatterAssessment(
  plan: ManufacturingPlan,
  state: ProcessControlState,
  observations: readonly ProcessObservation[],
): RecoveryAssessment | undefined {
  const vibration = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "vibration" }
    > => item.kind === "vibration",
  );
  if (vibration === undefined || vibration.chatterIndex < 1) {
    return undefined;
  }
  const humanStickout = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "human-correction" }
    > =>
      item.kind === "human-correction" &&
      item.field === "tool-stickout-mm" &&
      item.toolId === vibration.toolId,
  );
  if (humanStickout === undefined) {
    return assessment(state, observations, {
      diagnosis: "insufficient-evidence",
      evidenceQuality: "insufficient",
      evidence: [
        "Machine vibration indicates chatter, but the actual tool stickout has not been independently established.",
        "Request a human setup observation or tool-preset measurement before changing the process.",
      ],
      allowedActions: [],
      disposition: "insufficient-evidence",
    });
  }
  const tool = plan.tools.find((item) => item.id === vibration.toolId);
  if (tool === undefined) return undefined;
  const stickout = humanStickout.correctedValue;
  const ratio = stickout / tool.diameterMm;
  if (ratio > 3) {
    const shorter = Math.min(3 * tool.diameterMm, 28);
    const shorten: RecoveryAction = {
      id: "REC-SHORTEN-PROFILE-TOOL",
      _tag: "SetToolStickout",
      toolId: vibration.toolId,
      fromMm: stickout,
      toMm: shorter,
      basis:
        "Measured stickout exceeds 3x diameter while vibration shows chatter; shorten the tool first, then re-run the cut.",
    };
    const unload: RecoveryAction = {
      id: "REC-REDUCE-CUT-LOAD",
      _tag: "SetCutLoadScale",
      toolId: vibration.toolId,
      spindleScale: 0.9,
      feedScale: 0.8,
      basis:
        "If geometric clearance prevents shorter stickout, reduce cutting load and verify stability before release.",
    };
    return assessment(state, observations, {
      diagnosis: "chatter-excessive-stickout",
      evidenceQuality: "sufficient",
      evidence: [
        "Machine chatter index=" + vibration.chatterIndex.toFixed(2) + ".",
        "Human correction establishes actual stickout=" +
          stickout.toFixed(1) +
          " mm rather than controller metadata=" +
          humanStickout.previousValue.toFixed(1) +
          " mm.",
        "Stickout/diameter ratio=" + ratio.toFixed(2) + " (>3).",
      ],
      allowedActions: [shorten, unload],
      recommendedActionId: shorten.id,
      disposition: "action-recommended",
    });
  }
  return undefined;
}

function gageAssessment(
  state: ProcessControlState,
  observation: Extract<
    ProcessObservation,
    { readonly kind: "gage-rr" }
  >,
): RecoveryAssessment | undefined {
  if (observation.percentGrr > 30 || observation.ndc < 5) {
    const quarantine: RecoveryAction = {
      id: "REC-QUARANTINE-GAGE",
      _tag: "QuarantineMeasurementSystem",
      measurementSystemId: observation.measurementSystemId,
      basis:
        "Measurement system variation is too large for trusted compensation decisions; quarantine it before adjusting the machining process.",
    };
    const hold: RecoveryAction = {
      id: "REC-HOLD-FOR-GAGE",
      _tag: "SetProcessHold",
      hold: true,
      reason:
        "gage R&R failed for " + observation.measurementSystemId,
    };
    return assessment(state, [observation], {
      diagnosis: "measurement-system-inadequate",
      evidenceQuality: "measurement-system-untrusted",
      evidence: [
        "%GRR=" + observation.percentGrr.toFixed(1) + "%.",
        "ndc=" + observation.ndc.toFixed(1) + ".",
        "Do not use this measurement system to drive tool/process compensation.",
      ],
      allowedActions: [quarantine, hold],
      recommendedActionId: quarantine.id,
      disposition: "hold-measurement-system",
    });
  }
  return undefined;
}

function thermalAssessment(
  state: ProcessControlState,
  observation: Extract<
    ProcessObservation,
    { readonly kind: "thermal-drift" }
  >,
): RecoveryAssessment | undefined {
  if (!measurementTrusted(state, observation.measurementSystemId)) {
    return undefined;
  }
  const temperatureRise =
    observation.currentTemperatureC - observation.baselineTemperatureC;
  if (
    Math.abs(temperatureRise) >= 5 &&
    Math.abs(observation.measuredBiasMm) >= 0.02
  ) {
    const action: RecoveryAction = {
      id: "REC-THERMAL-WORK-OFFSET",
      _tag: "ApplyThermalWorkOffset",
      axis: observation.axis,
      deltaMm: Number((-observation.measuredBiasMm).toFixed(6)),
      basis:
        "Trusted in-process measurement shows correlated thermal bias; apply the equal-and-opposite bounded work-offset correction and remeasure.",
    };
    return assessment(state, [observation], {
      diagnosis: "thermal-drift",
      evidenceQuality: "sufficient",
      evidence: [
        "Machine temperature changed by " +
          temperatureRise.toFixed(1) +
          " C.",
        "Measured " +
          observation.axis.toUpperCase() +
          " bias=" +
          observation.measuredBiasMm.toFixed(3) +
          " mm.",
        "Measurement system " +
          observation.measurementSystemId +
          " is trusted.",
      ],
      allowedActions: [action],
      recommendedActionId: action.id,
      disposition: "action-recommended",
    });
  }
  return undefined;
}

export function assessProcessException(
  plan: ManufacturingPlan,
  state: ProcessControlState,
  observations: readonly ProcessObservation[],
): RecoveryAssessment {
  if (
    plan.candidateDigest !== state.candidateDigest ||
    plan.planDigest !== state.manufacturingPlanDigest
  ) {
    throw new TypeError(
      "process-control state belongs to a different manufacturing plan",
    );
  }
  if (observations.length === 0) {
    return assessment(state, observations, {
      diagnosis: "insufficient-evidence",
      evidenceQuality: "insufficient",
      evidence: ["No observations were supplied."],
      allowedActions: [],
      disposition: "insufficient-evidence",
    });
  }

  const gage = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "gage-rr" }
    > => item.kind === "gage-rr",
  );
  if (gage !== undefined) {
    const result = gageAssessment(state, gage);
    if (result !== undefined) return result;
  }

  const fixture = fixtureAssessment(state, observations);
  if (fixture !== undefined) return fixture;

  const chatter = chatterAssessment(plan, state, observations);
  if (chatter !== undefined) return chatter;

  const thermal = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "thermal-drift" }
    > => item.kind === "thermal-drift",
  );
  if (thermal !== undefined) {
    const result = thermalAssessment(state, thermal);
    if (result !== undefined) return result;
  }

  const dimensional = observations.find(
    (
      item,
    ): item is Extract<
      ProcessObservation,
      { readonly kind: "dimensional-trend" }
    > => item.kind === "dimensional-trend",
  );
  if (dimensional !== undefined) {
    const result = dimensionalTrendAssessment(state, dimensional);
    if (result !== undefined) return result;
  }

  return assessment(state, observations, {
    diagnosis: "no-exception",
    evidenceQuality: "sufficient",
    evidence: [
      "Supplied observations do not cross the bounded exception criteria.",
    ],
    allowedActions: [],
    disposition: "no-action",
  });
}

function verification(
  assessmentValue: RecoveryAssessment,
  adjustedState: ProcessControlState,
  observations: readonly ProcessObservation[],
  disposition: RecoveryVerification["disposition"],
  evidence: readonly string[],
): RecoveryVerification {
  const base = {
    schema: "gmr.recovery-verification/v1" as const,
    assessmentDigest: assessmentValue.assessmentDigest,
    adjustedStateDigest: adjustedState.stateDigest,
    verificationObservationDigests: observations.map(observationDigest),
    disposition,
    evidence,
  };
  return {
    ...base,
    verificationDigest: semanticDigest(base),
  };
}

export function verifyRecovery(
  assessmentValue: RecoveryAssessment,
  adjustedState: ProcessControlState,
  observations: readonly ProcessObservation[],
): RecoveryVerification {
  switch (assessmentValue.diagnosis) {
    case "tool-wear-drift": {
      const trend = observations.find(
        (
          item,
        ): item is Extract<
          ProcessObservation,
          { readonly kind: "dimensional-trend" }
        > => item.kind === "dimensional-trend",
      );
      if (trend !== undefined) {
        const allInside = trend.valuesMm.every(
          (value) =>
            value >= trend.lowerLimitMm &&
            value <= trend.upperLimitMm,
        );
        const span = Math.max(...trend.valuesMm) - Math.min(...trend.valuesMm);
        const restored =
          allInside &&
          span <=
            (trend.upperLimitMm - trend.lowerLimitMm) * 0.35;
        return verification(
          assessmentValue,
          adjustedState,
          observations,
          restored ? "restored" : "not-restored",
          [
            "Post-adjustment bore range=" + span.toFixed(4) + " mm.",
            allInside
              ? "All verification measurements are within size limits."
              : "At least one verification measurement remains outside size limits.",
          ],
        );
      }
      break;
    }
    case "clamp-induced-distortion": {
      const fixture = observations.find(
        (
          item,
        ): item is Extract<
          ProcessObservation,
          { readonly kind: "fixture-distortion" }
        > => item.kind === "fixture-distortion",
      );
      if (fixture !== undefined) {
        const restored =
          fixture.clampedFlatnessMm <= 0.15 &&
          fixture.clampedFlatnessMm - fixture.unclampedFlatnessMm <= 0.05;
        return verification(
          assessmentValue,
          adjustedState,
          observations,
          restored ? "restored" : "not-restored",
          [
            "Verification clamped flatness=" +
              fixture.clampedFlatnessMm.toFixed(3) +
              " mm.",
            "Clamp-induced delta=" +
              (
                fixture.clampedFlatnessMm -
                fixture.unclampedFlatnessMm
              ).toFixed(3) +
              " mm.",
          ],
        );
      }
      break;
    }
    case "chatter-excessive-stickout": {
      const vibration = observations.find(
        (
          item,
        ): item is Extract<
          ProcessObservation,
          { readonly kind: "vibration" }
        > => item.kind === "vibration",
      );
      if (vibration !== undefined) {
        const restored = vibration.chatterIndex < 0.8;
        return verification(
          assessmentValue,
          adjustedState,
          observations,
          restored ? "restored" : "not-restored",
          [
            "Verification chatter index=" +
              vibration.chatterIndex.toFixed(2) +
              ".",
            "RMS acceleration=" +
              vibration.rmsAccelerationG.toFixed(2) +
              " g.",
          ],
        );
      }
      break;
    }
    case "measurement-system-inadequate": {
      const gage = observations.find(
        (
          item,
        ): item is Extract<
          ProcessObservation,
          { readonly kind: "gage-rr" }
        > => item.kind === "gage-rr",
      );
      if (gage !== undefined) {
        const restored = gage.percentGrr <= 10 && gage.ndc >= 5;
        return verification(
          assessmentValue,
          adjustedState,
          observations,
          restored ? "measurement-system-restored" : "not-restored",
          [
            "Verification %GRR=" + gage.percentGrr.toFixed(1) + "%.",
            "Verification ndc=" + gage.ndc.toFixed(1) + ".",
            restored
              ? "Measurement system can be considered for release after quality approval; machining compensation remains unchanged."
              : "Measurement system remains unsuitable for compensation decisions.",
          ],
        );
      }
      break;
    }
    case "thermal-drift": {
      const thermal = observations.find(
        (
          item,
        ): item is Extract<
          ProcessObservation,
          { readonly kind: "thermal-drift" }
        > => item.kind === "thermal-drift",
      );
      if (thermal !== undefined) {
        const restored = Math.abs(thermal.measuredBiasMm) <= 0.01;
        return verification(
          assessmentValue,
          adjustedState,
          observations,
          restored ? "restored" : "not-restored",
          [
            "Residual measured bias=" +
              thermal.measuredBiasMm.toFixed(3) +
              " mm.",
          ],
        );
      }
      break;
    }
    case "insufficient-evidence":
    case "no-exception":
      break;
  }

  return verification(
    assessmentValue,
    adjustedState,
    observations,
    "not-restored",
    ["Verification observations are insufficient for this diagnosis."],
  );
}
