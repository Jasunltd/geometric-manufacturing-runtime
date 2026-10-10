import { semanticDigest } from "../integrity/canonical.js";
import type { ManufacturingPlan } from "../cam/model.js";
import type { DesignCandidate, DesignProblem } from "../design/model.js";
import type { MotionProgram } from "../motion/model.js";
import {
  simulateMetrology,
} from "./metrology.js";
import type {
  DfmCheck,
  DfmReport,
  DrawingSpec,
  InspectionCharacteristic,
  InspectionPlan,
  ManufacturingDossier,
  ProveoutCheck,
  VirtualProveout,
} from "./model.js";

function buildDrawing(
  problem: DesignProblem,
  candidate: DesignCandidate,
): DrawingSpec {
  const mount = problem.interfaces.mount;
  const payload = problem.interfaces.payload;
  const thickness = candidate.parameters.thicknessMm;
  const base = {
    schema: "gmr.drawing-spec/v1" as const,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    drawingNumber: "GMR-" + problem.id.toUpperCase(),
    revision: "A" as const,
    title: "GENERATED SENSOR BRACKET - PORTFOLIO ENGINEERING DRAWING",
    units: "mm" as const,
    scale: "2:1" as const,
    material: problem.material.label,
    standardReferences: [
      "ASME Y14.5-2018 (R2024) - dimensioning and tolerancing reference",
      "ASME Y14.100-2017 - engineering drawing practices reference",
      "ASME Y14.45-2021 - measurement data reporting reference",
    ],
    datums: [
      {
        id: "A" as const,
        semanticFeatureId: "broad-face.top",
        kind: "plane" as const,
        role:
          "Primary functional mounting plane; supplied plate face is accepted only after incoming flatness/thickness verification.",
      },
      {
        id: "B" as const,
        semanticFeatureId: mount.id + ".upper",
        kind: "axis" as const,
        role: "Upper mounting-hole axis establishes functional mount location.",
      },
      {
        id: "C" as const,
        semanticFeatureId: mount.id + ".lower",
        kind: "axis" as const,
        role: "Lower mounting-hole axis establishes clocking with datum B.",
      },
    ],
    sizes: [
      {
        id: "SR-THICKNESS",
        semanticFeatureId: "plate.thickness",
        nominalMm: thickness,
        lowerLimitMm: thickness - 0.15,
        upperLimitMm: thickness + 0.15,
        note:
          "Stock-controlled thickness for portfolio study; incoming material must satisfy this before machining.",
      },
      {
        id: "SR-MOUNT-HOLE",
        semanticFeatureId: mount.id + ".pattern",
        nominalMm: mount.mountHoleDiameterMm,
        lowerLimitMm: mount.mountHoleDiameterMm,
        upperLimitMm: mount.mountHoleDiameterMm + 0.1,
        note: "Two through mounting holes; drilling process is acceptable for this clearance-hole tolerance.",
      },
      {
        id: "SR-PAYLOAD-BORE",
        semanticFeatureId: payload.id,
        nominalMm: payload.boreDiameterMm,
        lowerLimitMm: payload.boreDiameterMm,
        upperLimitMm: payload.boreDiameterMm + 0.018,
        note:
          "Functional sensor bore; tight unilateral size tolerance intentionally drives finish-boring and variable inspection.",
      },
    ],
    basicDimensions: [
      {
        id: "BD-MOUNT-X",
        from: "left-profile-datum-origin",
        to: "mount-hole-station",
        valueMm: mount.mountHoleXFromDatumMm,
      },
      {
        id: "BD-MOUNT-SPACING",
        from: mount.id + ".lower",
        to: mount.id + ".upper",
        valueMm: mount.mountHoleSpacingMm,
      },
      {
        id: "BD-PAYLOAD-X",
        from: "left-profile-datum-origin",
        to: payload.id,
        valueMm: payload.axisXFromDatumMm,
      },
      {
        id: "BD-PAYLOAD-Y",
        from: "mount-pattern-midplane",
        to: payload.id,
        valueMm: 0,
      },
    ],
    geometricRequirements: [
      {
        id: "GR-A-FLATNESS",
        semanticFeatureId: "broad-face.top",
        control: "flatness" as const,
        toleranceMm: 0.15,
        datumReferenceFrame: [],
        note:
          "Portfolio functional flatness requirement for the primary mounting plane; current process relies on verified precision plate rather than facing.",
      },
      {
        id: "GR-PAYLOAD-POSITION",
        semanticFeatureId: payload.id,
        control: "position" as const,
        toleranceMm: 0.1,
        datumReferenceFrame: ["A", "B", "C"] as const,
        note:
          "Diametrical position zone for the payload-bore axis relative to the functional mounting datum reference frame.",
      },
      {
        id: "GR-PROFILE",
        semanticFeatureId: "outer-profile",
        control: "profile" as const,
        toleranceMm: 0.25,
        datumReferenceFrame: ["A", "B", "C"] as const,
        note:
          "Profile control ties the generated exterior contour, including an admitted root buttress when present, to the functional datum frame.",
      },
    ],
    notes: [
      "PORTFOLIO / RESEARCH DRAWING - NOT RELEASED FOR PRODUCTION.",
      "GD&T scheme communicates functional intent and is intended for engineering review against the cited standards before production release.",
      "DEBURR AND BREAK SHARP EDGES 0.2-0.5 MM UNLESS OTHERWISE SPECIFIED.",
      "DO NOT SCALE DRAWING; BASIC DIMENSIONS ARE THEORETICALLY EXACT IN THE DIGITAL DEFINITION.",
      "DATUM A IS STOCK-DERIVED IN THE CURRENT ONE-SETUP PROCESS; FAILURE OF INCOMING FLATNESS OR THICKNESS REQUIRES A PROCESS revision (e.g. facing and re-fixturing), not silent acceptance.",
    ],
  };
  return {
    ...base,
    drawingDigest: semanticDigest(base),
  };
}

function buildDfm(
  problem: DesignProblem,
  candidate: DesignCandidate,
  plan: ManufacturingPlan,
  drawing: DrawingSpec,
): DfmReport {
  const checks: DfmCheck[] = [];
  const setup = plan.setups[0];
  const bore = plan.setups
    .flatMap((item) => item.operations)
    .find((operation) => operation._tag === "FinishBore");
  const drill = plan.setups
    .flatMap((item) => item.operations)
    .find((operation) => operation._tag === "DrillMountPattern");
  const profile = plan.setups
    .flatMap((item) => item.operations)
    .find((operation) => operation._tag === "ProfileContour");
  const maxHalfWidth = Math.max(
    ...candidate.profile.map((point) => point.halfWidthMm),
  );
  const maxX = candidate.profile.at(-1)?.xMm ?? 0;

  checks.push({
    id: "DFM-STOCK",
    category: "stock",
    disposition:
      maxX <= problem.manufacturing.stock.maxXmm &&
      2 * maxHalfWidth <= problem.manufacturing.stock.maxYmm &&
      candidate.parameters.thicknessMm <= problem.manufacturing.stock.maxZmm
        ? "pass"
        : "fail",
    statement: "Candidate fits the declared plate-stock envelope.",
    evidence:
      "candidate envelope " +
      maxX.toFixed(2) +
      " x " +
      (2 * maxHalfWidth).toFixed(2) +
      " x " +
      candidate.parameters.thicknessMm.toFixed(2) +
      " mm vs stock " +
      problem.manufacturing.stock.maxXmm +
      " x " +
      problem.manufacturing.stock.maxYmm +
      " x " +
      problem.manufacturing.stock.maxZmm +
      " mm",
  });

  checks.push({
    id: "DFM-ACCESS",
    category: "access",
    disposition: "pass",
    statement:
      "All current machined features are top-accessible 2.5D through features or an exterior contour under the declared 3-axis process.",
    evidence:
      "No undercut or back-side feature exists in the admitted candidate semantics; planned setups=" +
      plan.setups.length,
  });

  checks.push({
    id: "DFM-MOUNT-DRILL",
    category: "tolerance-process",
    disposition: drill === undefined ? "fail" : "pass",
    statement:
      "Mount-hole size tolerance is mapped to the drilling operation and variable first-article inspection.",
    evidence:
      "drawing size " +
      drawing.sizes.find((item) => item.id === "SR-MOUNT-HOLE")?.lowerLimitMm.toFixed(3) +
      ".." +
      drawing.sizes.find((item) => item.id === "SR-MOUNT-HOLE")?.upperLimitMm.toFixed(3) +
      " mm; " +
      (drill === undefined ? "no drill operation" : drill.id),
  });

  checks.push({
    id: "DFM-PAYLOAD-BORE",
    category: "tolerance-process",
    disposition: bore === undefined ? "fail" : "pass",
    statement:
      "The tight payload-bore size requirement is not left to drilling; a dedicated finish-bore operation exists.",
    evidence:
      "SR-PAYLOAD-BORE width=0.018 mm; " +
      (bore === undefined ? "no finish-bore operation" : bore.id),
  });

  checks.push({
    id: "DFM-PROFILE",
    category: "tooling",
    disposition: profile === undefined ? "fail" : "pass",
    statement:
      "The complete exterior profile is represented explicitly in CAM and remains reachable by the declared profile cutter.",
    evidence:
      "minimum declared profile tool diameter=" +
      problem.manufacturing.minimumProfileToolDiameterMm +
      " mm; planned profile points=" +
      (profile?._tag === "ProfileContour" ? profile.contour.length : 0),
  });

  checks.push({
    id: "DFM-DATUM-A",
    category: "tolerance-process",
    disposition: "conditional",
    statement:
      "Datum A flatness and thickness are stock-controlled rather than generated by the current one-setup machining plan.",
    evidence:
      "No facing operation is present. Incoming stock must demonstrate SR-THICKNESS and GR-A-FLATNESS before the setup is accepted.",
  });

  checks.push({
    id: "DFM-WORKHOLDING",
    category: "workholding",
    disposition:
      setup?.fixture === "sacrificial-fixture-plate" ? "conditional" : "fail",
    statement:
      "Through holes and the through profile require verified fixture clearance and retained-part strategy.",
    evidence:
      "current setup fixture=" +
      String(setup?.fixture) +
      "; mounting holes are machined before the profile so they are available for supplemental retention",
  });

  checks.push({
    id: "DFM-INSPECTION",
    category: "inspection",
    disposition: "pass",
    statement:
      "Every released portfolio tolerance is mapped to an executable inspection characteristic.",
    evidence:
      "Drawing carries stock, hole/bore, datum-flatness, position, and profile requirements; inspection plan is generated from the same requirement IDs.",
  });

  const base = {
    schema: "gmr.dfm-report/v1" as const,
    candidateDigest: candidate.candidateDigest,
    manufacturingPlanDigest: plan.planDigest,
    checks,
    disposition: checks.some((check) => check.disposition === "fail")
      ? ("fail" as const)
      : ("pass-with-conditions" as const),
    limitations: [
      "This is deterministic design/process screening, not shop-floor prove-out.",
      "Tool reach uses the bounded 2.5D semantic model and does not yet model holder/fixture collision geometry.",
      "Feeds, speeds, tool stickout, coolant, clamp force, plate flatness certification, burr strategy, and actual machine dynamics require shop evidence.",
    ],
  };
  return {
    ...base,
    dfmDigest: semanticDigest(base),
  };
}

function buildInspectionPlan(
  candidate: DesignCandidate,
  drawing: DrawingSpec,
): InspectionPlan {
  const size = (id: string) => {
    const item = drawing.sizes.find((candidate) => candidate.id === id);
    if (item === undefined) throw new TypeError("missing size " + id);
    return item;
  };
  const geometric = (id: string) => {
    const item = drawing.geometricRequirements.find(
      (candidate) => candidate.id === id,
    );
    if (item === undefined) throw new TypeError("missing geometric requirement " + id);
    return item;
  };
  const thickness = size("SR-THICKNESS");
  const mount = size("SR-MOUNT-HOLE");
  const bore = size("SR-PAYLOAD-BORE");
  const flatness = geometric("GR-A-FLATNESS");
  const position = geometric("GR-PAYLOAD-POSITION");
  const profile = geometric("GR-PROFILE");

  const characteristics: InspectionCharacteristic[] = [
    {
      id: "IC-A-FLATNESS",
      sourceRequirementId: flatness.id,
      description: "Datum A flatness",
      maximumMm: flatness.toleranceMm,
      method: "cmm-plane",
      resolutionMm: 0.001,
      sampling: "First article: 5 x 5 distributed points; production plan subject to control-plan approval.",
      acceptance: "Measured minimum-zone proxy from best-fit plane residual range <= 0.150 mm.",
    },
    {
      id: "IC-THICKNESS",
      sourceRequirementId: thickness.id,
      description: "Plate thickness",
      nominalMm: thickness.nominalMm,
      lowerLimitMm: thickness.lowerLimitMm,
      upperLimitMm: thickness.upperLimitMm,
      method: "micrometer",
      resolutionMm: 0.001,
      sampling: "First article: four perimeter locations; lot projection models one representative value per part.",
      acceptance:
        thickness.lowerLimitMm.toFixed(3) +
        " <= measured thickness <= " +
        thickness.upperLimitMm.toFixed(3) +
        " mm.",
    },
    {
      id: "IC-MOUNT-UPPER-SIZE",
      sourceRequirementId: mount.id,
      description: "Upper mounting-hole diameter",
      nominalMm: mount.nominalMm,
      lowerLimitMm: mount.lowerLimitMm,
      upperLimitMm: mount.upperLimitMm,
      method: "bore-gage-or-cmm",
      resolutionMm: 0.002,
      sampling: "First article variable measurement; production may use GO/NO-GO after gauge study.",
      acceptance:
        mount.lowerLimitMm.toFixed(3) +
        " <= fitted diameter <= " +
        mount.upperLimitMm.toFixed(3) +
        " mm.",
    },
    {
      id: "IC-MOUNT-LOWER-SIZE",
      sourceRequirementId: mount.id,
      description: "Lower mounting-hole diameter",
      nominalMm: mount.nominalMm,
      lowerLimitMm: mount.lowerLimitMm,
      upperLimitMm: mount.upperLimitMm,
      method: "bore-gage-or-cmm",
      resolutionMm: 0.002,
      sampling: "First article variable measurement; production may use GO/NO-GO after gauge study.",
      acceptance:
        mount.lowerLimitMm.toFixed(3) +
        " <= fitted diameter <= " +
        mount.upperLimitMm.toFixed(3) +
        " mm.",
    },
    {
      id: "IC-PAYLOAD-BORE-SIZE",
      sourceRequirementId: bore.id,
      description: "Payload bore diameter",
      nominalMm: bore.nominalMm,
      lowerLimitMm: bore.lowerLimitMm,
      upperLimitMm: bore.upperLimitMm,
      method: "bore-gage-or-cmm",
      resolutionMm: 0.001,
      sampling: "100% in portfolio control plan because this is the tight functional feature.",
      acceptance:
        bore.lowerLimitMm.toFixed(3) +
        " <= fitted diameter <= " +
        bore.upperLimitMm.toFixed(3) +
        " mm.",
    },
    {
      id: "IC-PAYLOAD-BORE-POSITION",
      sourceRequirementId: position.id,
      description: "Payload bore true position relative to A|B|C",
      maximumMm: position.toleranceMm,
      method: "cmm-position",
      resolutionMm: 0.001,
      sampling: "100% in portfolio control plan; establish A then datum-hole axes B and C before evaluating payload-bore axis.",
      acceptance:
        "Diametrical true-position result <= " +
        position.toleranceMm.toFixed(3) +
        " mm.",
    },
    {
      id: "IC-PROFILE",
      sourceRequirementId: profile.id,
      description: "Exterior profile relative to A|B|C",
      maximumMm: profile.toleranceMm,
      method: "cmm-profile",
      resolutionMm: 0.002,
      sampling: "First article distributed contour sample including taper/buttress transition stations.",
      acceptance:
        "Maximum simulated profile deviation <= " +
        profile.toleranceMm.toFixed(3) +
        " mm.",
    },
  ];

  const base = {
    schema: "gmr.inspection-plan/v1" as const,
    candidateDigest: candidate.candidateDigest,
    drawingDigest: drawing.drawingDigest,
    characteristics,
    notes: [
      "Measurement data presentation follows the intent of ASME Y14.45-2021; this portfolio implementation is not a standards certification.",
      "Gauge selection is provisional. Production use requires calibration/traceability and measurement-system characterization including repeatability, reproducibility, stability, bias, resolution, linearity, and environment.",
      "Acceptance decisions must use actual measured data and an approved uncertainty/decision rule; synthetic results below are demonstration evidence only.",
    ],
  };
  return {
    ...base,
    inspectionPlanDigest: semanticDigest(base),
  };
}

function buildProveout(
  candidate: DesignCandidate,
  motion: MotionProgram,
): VirtualProveout {
  const machine = {
    id: "portfolio-3axis-mill-v1" as const,
    xRangeMm: [-25, 150] as const,
    yRangeMm: [-75, 75] as const,
    zRangeMm: [-30, 125] as const,
  };
  const checks: ProveoutCheck[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  let spindle = false;
  let coolant = false;
  let toolLength = false;
  let envelopeViolation = false;
  let cuttingStateViolation = false;
  let rapidBelowClearance = false;
  let minRapidZ = Number.POSITIVE_INFINITY;
  let minCutZ = Number.POSITIVE_INFINITY;
  let maxCutZ = Number.NEGATIVE_INFINITY;

  const within = (
    value: number,
    range: readonly [number, number],
  ) => value >= range[0] - 1e-9 && value <= range[1] + 1e-9;

  for (const command of motion.commands) {
    switch (command._tag) {
      case "SpindleOn":
        spindle = true;
        break;
      case "SpindleOff":
        spindle = false;
        break;
      case "CoolantOn":
        coolant = true;
        break;
      case "CoolantOff":
        coolant = false;
        break;
      case "ToolLengthOn":
        toolLength = true;
        z = command.safeZ;
        break;
      case "ToolLengthOff":
        toolLength = false;
        break;
      case "Rapid": {
        const xyMove =
          command.position.x !== undefined || command.position.y !== undefined;
        x = command.position.x ?? x;
        y = command.position.y ?? y;
        z = command.position.z ?? z;
        if (xyMove) {
          minRapidZ = Math.min(minRapidZ, z);
          if (z < 3 - 1e-9) rapidBelowClearance = true;
        }
        break;
      }
      case "FeedLinear":
        x = command.position.x ?? x;
        y = command.position.y ?? y;
        z = command.position.z ?? z;
        if (z <= 0) {
          minCutZ = Math.min(minCutZ, z);
          maxCutZ = Math.max(maxCutZ, z);
          if (!spindle || !coolant || !toolLength) {
            cuttingStateViolation = true;
          }
        }
        break;
      case "DrillCycle":
      case "BoreCycle":
        x = command.point.x;
        y = command.point.y;
        z = command.z;
        minCutZ = Math.min(minCutZ, z);
        maxCutZ = Math.max(maxCutZ, z);
        if (!spindle || !coolant || !toolLength) {
          cuttingStateViolation = true;
        }
        z = command.retractZ;
        break;
      case "CutterCompLeadIn":
      case "CutterCompLeadOut":
        x = command.end.x;
        y = command.end.y;
        if (z <= 0) {
          minCutZ = Math.min(minCutZ, z);
          maxCutZ = Math.max(maxCutZ, z);
          if (!spindle || !coolant || !toolLength) {
            cuttingStateViolation = true;
          }
        }
        break;
      default:
        break;
    }

    if (
      !within(x, machine.xRangeMm) ||
      !within(y, machine.yRangeMm) ||
      !within(z, machine.zRangeMm)
    ) {
      envelopeViolation = true;
    }
  }

  checks.push({
    id: "PROVEOUT-ENVELOPE",
    disposition: envelopeViolation ? "fail" : "pass",
    statement: "All modeled motion endpoints fit the declared virtual machine travels.",
    evidence:
      "virtual travels X[" +
      machine.xRangeMm.join(",") +
      "] Y[" +
      machine.yRangeMm.join(",") +
      "] Z[" +
      machine.zRangeMm.join(",") +
      "] mm",
  });
  checks.push({
    id: "PROVEOUT-CUTTING-STATE",
    disposition: cuttingStateViolation ? "fail" : "pass",
    statement:
      "Every modeled cutting move/cycle occurs with spindle, coolant, and tool-length compensation active.",
    evidence: cuttingStateViolation
      ? "at least one cutting transition violated the required modal state"
      : "motion-state replay found no cutting transition without all required states",
  });
  checks.push({
    id: "PROVEOUT-RAPID-CLEARANCE",
    disposition: rapidBelowClearance ? "fail" : "pass",
    statement: "XY rapid positioning remains above the declared retract clearance.",
    evidence:
      "minimum Z observed during an XY rapid=" +
      (Number.isFinite(minRapidZ) ? minRapidZ.toFixed(3) : "n/a") +
      " mm",
  });
  const requiredBottom = -candidate.parameters.thicknessMm;
  checks.push({
    id: "PROVEOUT-THROUGH-CLEARANCE",
    disposition:
      minCutZ >= requiredBottom - 0.5 - 1e-9 ? "conditional" : "fail",
    statement:
      "Through-feature overtravel remains bounded but requires real sacrificial-fixture clearance.",
    evidence:
      "stock bottom Z=" +
      requiredBottom.toFixed(3) +
      " mm; deepest modeled cut Z=" +
      minCutZ.toFixed(3) +
      " mm",
  });
  checks.push({
    id: "PROVEOUT-EXTERNAL-SIM",
    disposition: "conditional",
    statement:
      "LinuxCNC-target NC is compatible with the documented CAMotics parser subset used by this program, but external material-removal simulation is not executed on this host.",
    evidence:
      "Program subset uses G0/G1, G40/G41/G42, G43/G49, G54, G81/G85/G80, tool/spindle/coolant commands; compatible CAMotics runtime is an optional environment dependency.",
  });

  const base = {
    schema: "gmr.virtual-proveout/v1" as const,
    candidateDigest: candidate.candidateDigest,
    motionDigest: motion.motionDigest,
    virtualMachine: machine,
    checks,
    minimumRapidZMm: Number.isFinite(minRapidZ) ? minRapidZ : 0,
    minimumCutZMm: Number.isFinite(minCutZ) ? minCutZ : 0,
    maximumCutZMm: Number.isFinite(maxCutZ) ? maxCutZ : 0,
    externalSimulator: {
      recommended: "CAMotics" as const,
      parserCompatibility: "supported-subset" as const,
      executionStatus: "not-run-environment-dependency" as const,
      note:
        "The official CAMotics 1.2.0 Debian binary depends on legacy shared libraries not present on this host. The core prove-out therefore does not claim an external material-removal run.",
    },
    disposition: checks.some((check) => check.disposition === "fail")
      ? ("fail" as const)
      : ("pass-with-conditions" as const),
    limitations: [
      "Virtual replay checks typed motion state and endpoint envelopes; it is not a servo/dynamics model.",
      "Fixture, holder, spindle-nose, clamp, chip, chatter, runout, tool deflection, thermal drift, and rapid-in-material collision geometry are not represented.",
      "CAMotics documents additional limitations including no fixture/tool-shaft collision detection; external simulation is useful evidence but still not physical prove-out.",
    ],
  };
  return {
    ...base,
    proveoutDigest: semanticDigest(base),
  };
}

export function buildManufacturingDossier(
  problem: DesignProblem,
  candidate: DesignCandidate,
  plan: ManufacturingPlan,
  motion: MotionProgram,
): ManufacturingDossier {
  const problemDigest = semanticDigest(problem);
  if (candidate.problemDigest !== problemDigest) {
    throw new TypeError("candidate belongs to a different DesignProblem");
  }
  if (plan.candidateDigest !== candidate.candidateDigest) {
    throw new TypeError("manufacturing plan belongs to a different candidate");
  }
  if (motion.manufacturingPlanDigest !== plan.planDigest) {
    throw new TypeError("motion program belongs to a different manufacturing plan");
  }

  const drawing = buildDrawing(problem, candidate);
  const dfm = buildDfm(problem, candidate, plan, drawing);
  const inspection = buildInspectionPlan(candidate, drawing);
  const metrology = simulateMetrology(
    candidate.candidateDigest,
    drawing,
    inspection,
  );
  const proveout = buildProveout(candidate, motion);
  const base = {
    schema: "gmr.manufacturing-dossier/v1" as const,
    candidateId: candidate.id,
    candidateDigest: candidate.candidateDigest,
    drawing,
    dfm,
    inspection,
    metrology,
    proveout,
  };
  return {
    ...base,
    dossierDigest: semanticDigest(base),
  };
}
