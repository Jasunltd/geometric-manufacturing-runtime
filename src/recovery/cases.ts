import type { ManufacturingPlan } from "../cam/model.js";
import type { CompileResult } from "../model.js";
import { semanticDigest } from "../integrity/canonical.js";
import {
  assessProcessException,
  verifyRecovery,
} from "./assess.js";
import {
  compileProcessObservations,
} from "./compile.js";
import type {
  ProcessDiagnosisCode,
  ProcessRecoveryCaseStudy,
  ProcessRecoveryScenario,
  RecoveryAction,
} from "./model.js";
import {
  applyRecoveryAction,
  createProcessControlState,
} from "./state.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function diagnosis(value: unknown): ProcessDiagnosisCode | undefined {
  return typeof value === "string" &&
    [
      "tool-wear-drift",
      "clamp-induced-distortion",
      "chatter-excessive-stickout",
      "measurement-system-inadequate",
      "thermal-drift",
    ].includes(value)
    ? (value as ProcessDiagnosisCode)
    : undefined;
}

function actionTag(value: unknown): RecoveryAction["_tag"] | undefined {
  return typeof value === "string" &&
    [
      "AdjustToolDiameter",
      "SetClampForceScale",
      "SetToolStickout",
      "SetCutLoadScale",
      "QuarantineMeasurementSystem",
      "ReleaseMeasurementSystem",
      "SetProcessHold",
      "ApplyThermalWorkOffset",
    ].includes(value)
    ? (value as RecoveryAction["_tag"])
    : undefined;
}

export function compileProcessRecoveryScenario(
  value: unknown,
): CompileResult<ProcessRecoveryScenario> {
  const input = record(value);
  const expectedDiagnosis = diagnosis(input?.expectedDiagnosis);
  const expectedRecommendedAction = actionTag(
    input?.expectedRecommendedAction,
  );
  if (
    input?.schema !== "gmr.process-recovery-scenario/v1" ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    typeof input.title !== "string" ||
    input.title.length === 0 ||
    typeof input.objective !== "string" ||
    input.objective.length === 0 ||
    !Array.isArray(input.initialObservations) ||
    !Array.isArray(input.verificationObservations) ||
    expectedDiagnosis === undefined ||
    expectedRecommendedAction === undefined
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-process-recovery-scenario",
      detail:
        "scenario requires id/title/objective, observation arrays, expected diagnosis, and expected action",
    };
  }
  const scenario: ProcessRecoveryScenario = {
    schema: "gmr.process-recovery-scenario/v1",
    id: input.id,
    title: input.title,
    objective: input.objective,
    initialObservations: input.initialObservations,
    verificationObservations: input.verificationObservations,
    expectedDiagnosis:
      expectedDiagnosis as ProcessRecoveryScenario["expectedDiagnosis"],
    expectedRecommendedAction,
  };
  return {
    _tag: "Compiled",
    value: scenario,
    digest: semanticDigest(scenario),
  };
}

function claimsFor(
  scenario: ProcessRecoveryScenario,
  study: Omit<ProcessRecoveryCaseStudy, "claims" | "limitations" | "caseStudyDigest">,
): readonly string[] {
  switch (study.assessment.diagnosis) {
    case "tool-wear-drift":
      return [
        "Trusted in-process dimensional feedback can trigger a bounded tool-diameter correction before a feature crosses its size limit.",
        "The correction is applied to process-control state rather than changing nominal design geometry.",
        "Post-adjustment measurements must independently demonstrate recovery.",
      ];
    case "clamp-induced-distortion":
      return [
        "Comparing unclamped and clamped metrology separates incoming-part shape from fixture-induced distortion.",
        "A human setup correction can supersede stale controller/setup metadata without bypassing the same typed observation compiler.",
        "Clamp-force reduction is verified by a second clamped measurement before release.",
      ];
    case "chatter-excessive-stickout":
      return [
        "Machine vibration establishes the process symptom while a human setup observation establishes the actual stickout needed for diagnosis.",
        "The preferred correction reduces tool stickout before changing feeds/speeds when geometric clearance permits.",
        "A second vibration observation verifies whether the stability problem was actually removed.",
      ];
    case "measurement-system-inadequate":
      return [
        "A failed gage R&R blocks machining compensation instead of allowing bad measurement data to steer the process.",
        "The measurement system is quarantined and the process is held while its measurement capability is restored.",
        "A passing follow-up study supports release consideration but does not silently alter the machining process.",
      ];
    case "thermal-drift":
      return [
        "Trusted machine/metrology feedback can drive a bounded thermal work-offset correction without changing canonical geometry.",
        "The correction is equal-and-opposite to the observed bias and remains explicit in process-control state.",
        "Residual bias must be remeasured after compensation.",
      ];
    default:
      return [
        "The scenario did not reach the expected bounded recovery diagnosis.",
      ];
  }
}

export function runProcessRecoveryScenario(
  plan: ManufacturingPlan,
  input: unknown,
): ProcessRecoveryCaseStudy {
  const scenarioCompiled = compileProcessRecoveryScenario(input);
  if (scenarioCompiled._tag !== "Compiled") {
    throw new TypeError(scenarioCompiled.detail);
  }
  const scenario = scenarioCompiled.value;
  const initialCompiled = compileProcessObservations(
    scenario.initialObservations,
  );
  if (initialCompiled._tag !== "Compiled") {
    throw new TypeError(initialCompiled.detail);
  }
  const initialState = createProcessControlState(plan);
  const assessment = assessProcessException(
    plan,
    initialState,
    initialCompiled.value,
  );
  if (assessment.diagnosis !== scenario.expectedDiagnosis) {
    throw new TypeError(
      scenario.id +
        " expected diagnosis " +
        scenario.expectedDiagnosis +
        " but got " +
        assessment.diagnosis,
    );
  }
  const recommended =
    assessment.recommendedActionId === undefined
      ? undefined
      : assessment.allowedActions.find(
          (action) => action.id === assessment.recommendedActionId,
        );
  if (
    recommended === undefined ||
    recommended._tag !== scenario.expectedRecommendedAction
  ) {
    throw new TypeError(
      scenario.id +
        " expected recommended action " +
        scenario.expectedRecommendedAction,
    );
  }

  const application = applyRecoveryAction(
    initialState,
    assessment,
    recommended.id,
  );
  const verificationCompiled = compileProcessObservations(
    scenario.verificationObservations,
  );
  if (verificationCompiled._tag !== "Compiled") {
    throw new TypeError(verificationCompiled.detail);
  }
  const verification = verifyRecovery(
    assessment,
    application.after,
    verificationCompiled.value,
  );
  if (
    verification.disposition !== "restored" &&
    verification.disposition !== "measurement-system-restored"
  ) {
    throw new TypeError(
      scenario.id +
        " did not recover: " +
        verification.disposition,
    );
  }

  const core = {
    schema: "gmr.process-recovery-case-study/v1" as const,
    scenarioId: scenario.id,
    title: scenario.title,
    objective: scenario.objective,
    candidateDigest: plan.candidateDigest,
    manufacturingPlanDigest: plan.planDigest,
    initialState,
    observations: initialCompiled.value,
    assessment,
    application,
    verificationObservations: verificationCompiled.value,
    verification,
  };
  const claims = claimsFor(scenario, core);
  const limitations = [
    "This case study uses deterministic simulated observations to exercise process-diagnosis and recovery semantics; it is not physical-machine evidence.",
    "Thresholds and correction bounds are portfolio hypotheses and require machine/process-specific validation before production use.",
    "Human observations enter through the same typed compiler but remain observations, not privileged authority that can bypass evidence gates.",
    "Machine feedback is treated as evidence only when its declared measurement system is trusted; failed measurement-system studies block process compensation.",
    "Recovery verification checks the bounded scenario's declared response; unknown physical causes remain possible and require escalation when observations do not match the model.",
  ];
  const base = {
    ...core,
    claims,
    limitations,
  };
  return {
    ...base,
    caseStudyDigest: semanticDigest(base),
  };
}