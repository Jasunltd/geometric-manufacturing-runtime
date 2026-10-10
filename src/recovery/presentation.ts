import type {
  ProcessObservation,
  ProcessRecoveryCaseStudy,
  RecoveryAction,
} from "./model.js";

function sourceLabel(observation: ProcessObservation): string {
  switch (observation.source.kind) {
    case "machine-feedback":
      return "machine:" + observation.source.systemId + "/" + observation.source.channel;
    case "metrology":
      return "metrology:" + observation.source.systemId + "/" + observation.source.method;
    case "human":
      return "human:" + observation.source.operatorId + "/" + observation.source.role;
  }
}

function observationSummary(observation: ProcessObservation): string {
  switch (observation.kind) {
    case "dimensional-trend":
      return observation.characteristicId + " = [" +
        observation.valuesMm.map((value) => value.toFixed(4)).join(", ") +
        "] mm; limits " + observation.lowerLimitMm.toFixed(4) + ".." +
        observation.upperLimitMm.toFixed(4);
    case "fixture-distortion":
      return "unclamped flatness " + observation.unclampedFlatnessMm.toFixed(3) +
        " mm; clamped " + observation.clampedFlatnessMm.toFixed(3) +
        " mm; clamp scale " + observation.clampForceScale.toFixed(3);
    case "vibration":
      return observation.toolId + " chatter index " +
        observation.chatterIndex.toFixed(2) + "; RMS " +
        observation.rmsAccelerationG.toFixed(2) + " g";
    case "human-correction":
      return observation.field + " corrected " +
        observation.previousValue.toFixed(3) + " -> " +
        observation.correctedValue.toFixed(3) + "; " + observation.reason;
    case "gage-rr":
      return observation.measurementSystemId + " %GRR " +
        observation.percentGrr.toFixed(1) + "%; ndc " +
        observation.ndc.toFixed(1);
    case "thermal-drift":
      return observation.axis.toUpperCase() + " bias " +
        observation.measuredBiasMm.toFixed(3) + " mm; temperature " +
        observation.baselineTemperatureC.toFixed(1) + " -> " +
        observation.currentTemperatureC.toFixed(1) + " C";
  }
}

function actionSummary(action: RecoveryAction): string {
  switch (action._tag) {
    case "AdjustToolDiameter":
      return "Adjust " + action.toolId + " diameter correction by " +
        (action.deltaMm >= 0 ? "+" : "") + action.deltaMm.toFixed(4) + " mm";
    case "SetClampForceScale":
      return "Set clamp-force scale " + action.from.toFixed(3) +
        " -> " + action.to.toFixed(3);
    case "SetToolStickout":
      return "Set " + action.toolId + " stickout " +
        action.fromMm.toFixed(1) + " -> " + action.toMm.toFixed(1) + " mm";
    case "SetCutLoadScale":
      return "Set " + action.toolId + " spindle/feed scales to " +
        action.spindleScale.toFixed(2) + "/" + action.feedScale.toFixed(2);
    case "QuarantineMeasurementSystem":
      return "Quarantine measurement system " + action.measurementSystemId;
    case "ReleaseMeasurementSystem":
      return "Release measurement system " + action.measurementSystemId;
    case "SetProcessHold":
      return (action.hold ? "Place" : "Release") + " process hold";
    case "ApplyThermalWorkOffset":
      return "Apply " + action.axis.toUpperCase() + " thermal work-offset " +
        (action.deltaMm >= 0 ? "+" : "") + action.deltaMm.toFixed(4) + " mm";
  }
}

export function renderRecoveryCaseStudyMarkdown(
  study: ProcessRecoveryCaseStudy,
): string {
  const initialRows = study.observations.map((observation) =>
    "| " + observation.id + " | " + sourceLabel(observation) + " | " +
    observation.kind + " | " + observationSummary(observation).replaceAll("|", "\\|") + " |"
  ).join("\n");
  const verifyRows = study.verificationObservations.map((observation) =>
    "| " + observation.id + " | " + sourceLabel(observation) + " | " +
    observationSummary(observation).replaceAll("|", "\\|") + " |"
  ).join("\n");
  const basis = "basis" in study.application.action
    ? study.application.action.basis
    : "Explicit process-control state change.";

  return [
    "# " + study.title,
    "",
    "**Scenario:** " + study.scenarioId,
    "**Claim level:** simulated process-recovery exercise, not physical-machine evidence",
    "**Case digest:** " + study.caseStudyDigest,
    "",
    "## Objective",
    "",
    study.objective,
    "",
    "## Incoming observations",
    "",
    "| Observation | Source | Kind | Evidence |",
    "| --- | --- | --- | --- |",
    initialRows,
    "",
    "## Diagnosis",
    "",
    "**" + study.assessment.diagnosis + "** — evidence quality: **" +
      study.assessment.evidenceQuality + "**",
    "",
    study.assessment.evidence.map((item) => "- " + item).join("\n"),
    "",
    "## Adjustment",
    "",
    "**" + actionSummary(study.application.action) + "**",
    "",
    basis,
    "",
    "The adjustment changes process-control state revision " +
      study.initialState.revision + " -> " + study.application.after.revision +
      "; nominal design geometry and candidate identity remain unchanged.",
    "",
    "## Verification observations",
    "",
    "| Observation | Source | Evidence |",
    "| --- | --- | --- |",
    verifyRows,
    "",
    "**Verification:** " + study.verification.disposition,
    "",
    study.verification.evidence.map((item) => "- " + item).join("\n"),
    "",
    "## What this demonstrates",
    "",
    study.claims.map((item) => "- " + item).join("\n"),
    "",
    "## Limits",
    "",
    study.limitations.map((item) => "- " + item).join("\n"),
    "",
  ].join("\n");
}
