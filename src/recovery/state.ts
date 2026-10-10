import type { ManufacturingPlan } from "../cam/model.js";
import { semanticDigest } from "../integrity/canonical.js";
import type {
  MeasurementSystemState,
  ProcessControlState,
  RecoveryAction,
  RecoveryActionApplication,
  RecoveryAssessment,
  ToolAdjustment,
} from "./model.js";

function withDigest(
  base: Omit<ProcessControlState, "stateDigest">,
): ProcessControlState {
  return { ...base, stateDigest: semanticDigest(base) };
}

export function createProcessControlState(
  plan: ManufacturingPlan,
): ProcessControlState {
  const toolAdjustments: ToolAdjustment[] = plan.tools.map((tool) => ({
    toolId: tool.id,
    diameterCorrectionMm: 0,
    ...(tool.kind === "flat-end-mill" ? { stickoutMm: 30 } : {}),
    spindleScale: 1,
    feedScale: 1,
  }));
  const measurementSystems: MeasurementSystemState[] = [
    { systemId: "machine-probe", disposition: "trusted" },
    { systemId: "fixture-cmm", disposition: "trusted" },
    { systemId: "bore-gage-cmm", disposition: "trusted" },
    { systemId: "accelerometer", disposition: "trusted" },
  ];
  return withDigest({
    schema: "gmr.process-control-state/v1",
    candidateDigest: plan.candidateDigest,
    manufacturingPlanDigest: plan.planDigest,
    revision: 0,
    toolAdjustments,
    clampForceScale: 1,
    thermalWorkOffsetMm: { x: 0, y: 0, z: 0 },
    measurementSystems,
    processHold: false,
  });
}

function toolAdjustment(
  state: ProcessControlState,
  toolId: string,
): ToolAdjustment {
  const found = state.toolAdjustments.find((item) => item.toolId === toolId);
  if (found === undefined) {
    throw new TypeError("unknown recovery tool " + toolId);
  }
  return found;
}

function replaceTool(
  state: ProcessControlState,
  value: ToolAdjustment,
): readonly ToolAdjustment[] {
  return state.toolAdjustments.map((item) =>
    item.toolId === value.toolId ? value : item,
  );
}

function replaceMeasurementSystem(
  state: ProcessControlState,
  systemId: string,
  disposition: MeasurementSystemState["disposition"],
  reason?: string,
): readonly MeasurementSystemState[] {
  const next: MeasurementSystemState = {
    systemId,
    disposition,
    ...(reason === undefined ? {} : { reason }),
  };
  const exists = state.measurementSystems.some(
    (item) => item.systemId === systemId,
  );
  return exists
    ? state.measurementSystems.map((item) =>
        item.systemId === systemId ? next : item,
      )
    : [...state.measurementSystems, next];
}

function apply(
  state: ProcessControlState,
  action: RecoveryAction,
): ProcessControlState {
  const base = {
    ...state,
    revision: state.revision + 1,
  };

  switch (action._tag) {
    case "AdjustToolDiameter": {
      const current = toolAdjustment(state, action.toolId);
      return withDigest({
        ...base,
        toolAdjustments: replaceTool(state, {
          ...current,
          diameterCorrectionMm:
            current.diameterCorrectionMm + action.deltaMm,
        }),
      });
    }
    case "SetClampForceScale":
      return withDigest({
        ...base,
        clampForceScale: action.to,
      });
    case "SetToolStickout": {
      const current = toolAdjustment(state, action.toolId);
      return withDigest({
        ...base,
        toolAdjustments: replaceTool(state, {
          ...current,
          stickoutMm: action.toMm,
        }),
      });
    }
    case "SetCutLoadScale": {
      const current = toolAdjustment(state, action.toolId);
      return withDigest({
        ...base,
        toolAdjustments: replaceTool(state, {
          ...current,
          spindleScale: action.spindleScale,
          feedScale: action.feedScale,
        }),
      });
    }
    case "QuarantineMeasurementSystem":
      return withDigest({
        ...base,
        measurementSystems: replaceMeasurementSystem(
          state,
          action.measurementSystemId,
          "quarantined",
          action.basis,
        ),
        processHold: true,
        holdReason:
          "measurement system " +
          action.measurementSystemId +
          " is quarantined",
      });
    case "ReleaseMeasurementSystem": {
      const systems = replaceMeasurementSystem(
        state,
        action.measurementSystemId,
        "trusted",
      );
      return withDigest({
        ...base,
        measurementSystems: systems,
        processHold: false,
      });
    }
    case "SetProcessHold":
      return withDigest({
        ...base,
        processHold: action.hold,
        ...(action.hold
          ? { holdReason: action.reason }
          : {}),
      });
    case "ApplyThermalWorkOffset": {
      const current = state.thermalWorkOffsetMm[action.axis];
      return withDigest({
        ...base,
        thermalWorkOffsetMm: {
          ...state.thermalWorkOffsetMm,
          [action.axis]: current + action.deltaMm,
        },
      });
    }
  }
}

export function applyRecoveryAction(
  state: ProcessControlState,
  assessment: RecoveryAssessment,
  actionId: string,
): RecoveryActionApplication {
  if (
    assessment.controlStateDigest !== state.stateDigest ||
    assessment.candidateDigest !== state.candidateDigest ||
    assessment.manufacturingPlanDigest !== state.manufacturingPlanDigest
  ) {
    throw new TypeError(
      "recovery assessment belongs to a different process-control state",
    );
  }
  const action = assessment.allowedActions.find(
    (candidate) => candidate.id === actionId,
  );
  if (action === undefined) {
    throw new TypeError(
      "recovery action is not admitted by the current assessment",
    );
  }
  const after = apply(state, action);
  const base = {
    schema: "gmr.recovery-action-application/v1" as const,
    beforeStateDigest: state.stateDigest,
    action,
    after,
  };
  return {
    ...base,
    applicationDigest: semanticDigest(base),
  };
}
