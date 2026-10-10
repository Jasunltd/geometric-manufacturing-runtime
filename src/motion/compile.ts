import { semanticDigest } from "../integrity/canonical.js";
import type {
  ManufacturingPlan,
  ToolDefinition,
} from "../cam/model.js";
import type { MotionCommand, MotionProgram } from "./model.js";

function toolById(
  plan: ManufacturingPlan,
  id: string,
): ToolDefinition {
  const tool = plan.tools.find((candidate) => candidate.id === id);
  if (tool === undefined) {
    throw new TypeError("unknown tool " + id);
  }
  return tool;
}

export function compileMotionProgram(
  plan: ManufacturingPlan,
  setupId = "S1.top",
): MotionProgram {
  const setup = plan.setups.find((candidate) => candidate.id === setupId);
  if (setup === undefined) {
    throw new TypeError("unknown setup " + setupId);
  }

  const commands: MotionCommand[] = [
    { _tag: "SetUnits", units: "mm" },
    { _tag: "SetPlane", plane: "XY" },
    { _tag: "SetDistanceMode", mode: "absolute" },
    { _tag: "SetFeedMode", mode: "units-per-minute" },
    { _tag: "CutterCompCancel" },
    { _tag: "ToolLengthOff" },
    { _tag: "SetWorkOffset", offset: setup.workOffset },
  ];

  for (const operation of setup.operations) {
    const tool = toolById(plan, operation.toolId);
    commands.push(
      {
        _tag: "ToolChange",
        toolNumber: tool.number,
        toolId: tool.id,
      },
      {
        _tag: "SpindleOn",
        rpm: tool.spindleRpm,
        direction: "cw",
      },
      {
        _tag: "ToolLengthOn",
        toolNumber: tool.number,
        safeZ: setup.clearanceZ,
      },
      { _tag: "CoolantOn" },
    );

    switch (operation._tag) {
      case "DrillMountPattern":
        for (const point of operation.points) {
          commands.push({
            _tag: "DrillCycle",
            point,
            z: operation.bottomZ,
            retractZ: operation.retractZ,
            feedMmPerMin: tool.feedMmPerMin,
          });
        }
        commands.push({ _tag: "CancelCannedCycle" });
        break;
      case "FinishBore":
        commands.push({
          _tag: "BoreCycle",
          point: operation.point,
          z: operation.bottomZ,
          retractZ: operation.retractZ,
          feedMmPerMin: tool.feedMmPerMin,
        });
        commands.push({ _tag: "CancelCannedCycle" });
        break;
      case "ProfileContour": {
        const first = operation.contour[0];
        if (first === undefined) {
          throw new TypeError("profile contour is empty");
        }
        const leadDistance = Math.max(tool.diameterMm, 5);
        const lead = { x: first.x - leadDistance, y: first.y };
        commands.push(
          { _tag: "Rapid", position: { x: lead.x, y: lead.y } },
          {
            _tag: "FeedLinear",
            position: { z: operation.bottomZ },
            feedMmPerMin: Math.min(250, tool.feedMmPerMin),
          },
          {
            _tag: "CutterCompLeadIn",
            side: operation.compensation,
            register: tool.number,
            end: first,
            feedMmPerMin: tool.feedMmPerMin,
          },
        );
        for (const point of operation.contour.slice(1)) {
          commands.push({
            _tag: "FeedLinear",
            position: { x: point.x, y: point.y },
            feedMmPerMin: tool.feedMmPerMin,
          });
        }
        commands.push({
          _tag: "CutterCompLeadOut",
          end: lead,
          feedMmPerMin: tool.feedMmPerMin,
        });
        break;
      }
    }

    commands.push(
      { _tag: "Rapid", position: { z: setup.clearanceZ } },
      { _tag: "CoolantOff" },
      { _tag: "SpindleOff" },
      { _tag: "ToolLengthOff" },
    );
  }
  commands.push({ _tag: "ProgramEnd" });

  const base = {
    schema: "gmr.motion-program/v1" as const,
    manufacturingPlanDigest: plan.planDigest,
    setupId: setup.id,
    commands,
  };
  return {
    ...base,
    motionDigest: semanticDigest(base),
  };
}
