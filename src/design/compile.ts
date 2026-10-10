
import { semanticDigest } from "../integrity/canonical.js";
import type { CompileResult } from "../model.js";
import type {
  CircularKeepOut,
  DesignObjective,
  DesignProblem,
  NumericRange,
} from "./model.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = finite(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function decodeRange(value: unknown, name: string): CompileResult<NumericRange> {
  const source = record(value);
  const min = source === undefined ? undefined : positive(source.min);
  const max = source === undefined ? undefined : positive(source.max);
  const step = source === undefined ? undefined : positive(source.step);
  if (
    min === undefined ||
    max === undefined ||
    step === undefined ||
    min > max
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-range",
      detail: name + " requires positive min <= max and positive step",
    };
  }
  const range: NumericRange = { min, max, step };
  return {
    _tag: "Compiled",
    value: range,
    digest: semanticDigest(range),
  };
}

export function compileDesignProblem(
  input: unknown,
): CompileResult<DesignProblem> {
  const sourceRoot = record(input);
  if (sourceRoot === undefined) {
    return {
      _tag: "CompileError",
      code: "invalid-design-problem",
      detail: "design problem must be an object",
    };
  }
  if (sourceRoot.schema !== "gmr.design-problem/v1") {
    return {
      _tag: "Unsupported",
      code: "unsupported-design-problem-schema",
      detail: "expected gmr.design-problem/v1",
    };
  }
  if (sourceRoot.units !== "mm-N-MPa") {
    return {
      _tag: "Unsupported",
      code: "unsupported-design-units",
      detail: "v0.2 supports mm-N-MPa only",
    };
  }

  const id = nonEmpty(sourceRoot.id);
  const interfaces = record(sourceRoot.interfaces);
  const mount = interfaces === undefined ? undefined : record(interfaces.mount);
  const payload =
    interfaces === undefined ? undefined : record(interfaces.payload);
  const requirements = record(sourceRoot.requirements);
  const material = record(sourceRoot.material);
  const manufacturing = record(sourceRoot.manufacturing);
  const stock =
    manufacturing === undefined ? undefined : record(manufacturing.stock);
  const grammar = record(sourceRoot.grammar);

  if (
    id === undefined ||
    mount === undefined ||
    payload === undefined ||
    requirements === undefined ||
    material === undefined ||
    manufacturing === undefined ||
    stock === undefined ||
    grammar === undefined
  ) {
    return {
      _tag: "CompileError",
      code: "missing-design-section",
      detail:
        "id, interfaces, requirements, material, manufacturing, and grammar are required",
    };
  }

  if (mount.datum !== "A") {
    return {
      _tag: "Unsupported",
      code: "unsupported-datum-system",
      detail: "v0.2 bracket grammar requires primary datum A",
    };
  }
  if (manufacturing.process !== "three-axis-milling") {
    return {
      _tag: "Unsupported",
      code: "unsupported-process",
      detail: "v0.2 supports three-axis-milling only",
    };
  }
  if (grammar.family !== "tapered-plate-arm") {
    return {
      _tag: "Unsupported",
      code: "unsupported-design-grammar",
      detail: "v0.2 supports tapered-plate-arm only",
    };
  }

  const mountHoleDiameterMm = positive(mount.mountHoleDiameterMm);
  const mountHoleXFromDatumMm = positive(mount.mountHoleXFromDatumMm);
  const mountHoleSpacingMm = positive(mount.mountHoleSpacingMm);
  const boreDiameterMm = positive(payload.boreDiameterMm);
  const axisXFromDatumMm = positive(payload.axisXFromDatumMm);
  const endMarginMm = positive(payload.endMarginMm);
  const maxTipDeflectionMm = positive(requirements.maxTipDeflectionMm);
  const minStaticFactorOfSafety = positive(
    requirements.minStaticFactorOfSafety,
  );
  const minEdgeDistanceMm = positive(requirements.minEdgeDistanceMm);
  const youngsModulusMPa = positive(material.youngsModulusMPa);
  const poissonRatio = positive(material.poissonRatio);
  const densityKgPerM3 = positive(material.densityKgPerM3);
  const yieldStrengthMPa = positive(material.yieldStrengthMPa);
  const minimumProfileToolDiameterMm = positive(
    manufacturing.minimumProfileToolDiameterMm,
  );
  const maxXmm = positive(stock.maxXmm);
  const maxYmm = positive(stock.maxYmm);
  const maxZmm = positive(stock.maxZmm);

  const requiredPositive: readonly [string, number | undefined][] = [
    ["mountHoleDiameterMm", mountHoleDiameterMm],
    ["mountHoleXFromDatumMm", mountHoleXFromDatumMm],
    ["mountHoleSpacingMm", mountHoleSpacingMm],
    ["boreDiameterMm", boreDiameterMm],
    ["axisXFromDatumMm", axisXFromDatumMm],
    ["endMarginMm", endMarginMm],
    ["maxTipDeflectionMm", maxTipDeflectionMm],
    ["minStaticFactorOfSafety", minStaticFactorOfSafety],
    ["minEdgeDistanceMm", minEdgeDistanceMm],
    ["youngsModulusMPa", youngsModulusMPa],
    ["poissonRatio", poissonRatio],
    ["densityKgPerM3", densityKgPerM3],
    ["yieldStrengthMPa", yieldStrengthMPa],
    ["minimumProfileToolDiameterMm", minimumProfileToolDiameterMm],
    ["stock.maxXmm", maxXmm],
    ["stock.maxYmm", maxYmm],
    ["stock.maxZmm", maxZmm],
  ];
  for (const [name, value] of requiredPositive) {
    if (value === undefined) {
      return {
        _tag: "CompileError",
        code: "invalid-design-scalar",
        detail: name + " must be a positive finite number",
      };
    }
  }

  if (poissonRatio! >= 0.5) {
    return {
      _tag: "CompileError",
      code: "invalid-poisson-ratio",
      detail: "poissonRatio must be > 0 and < 0.5",
    };
  }
  if (axisXFromDatumMm! <= mountHoleXFromDatumMm! + 20) {
    return {
      _tag: "CompileError",
      code: "invalid-interface-layout",
      detail:
        "payload axis must be at least 20 mm beyond the mounting-hole station",
    };
  }

  const thickness = decodeRange(grammar.thicknessMm, "thicknessMm");
  if (thickness._tag !== "Compiled") return thickness;
  const rootWidth = decodeRange(
    grammar.rootHalfWidthMm,
    "rootHalfWidthMm",
  );
  if (rootWidth._tag !== "Compiled") return rootWidth;
  const armWidth = decodeRange(
    grammar.armHalfWidthMm,
    "armHalfWidthMm",
  );
  if (armWidth._tag !== "Compiled") return armWidth;
  const tipWidth = decodeRange(
    grammar.tipHalfWidthMm,
    "tipHalfWidthMm",
  );
  if (tipWidth._tag !== "Compiled") return tipWidth;
  const rootButtressLength =
    grammar.rootButtressLengthMm === undefined
      ? undefined
      : decodeRange(grammar.rootButtressLengthMm, "rootButtressLengthMm");
  if (rootButtressLength !== undefined && rootButtressLength._tag !== "Compiled") {
    return rootButtressLength;
  }

  if (manufacturing.maxSetups !== 1 && manufacturing.maxSetups !== 2) {
    return {
      _tag: "CompileError",
      code: "invalid-setup-limit",
      detail: "maxSetups must be 1 or 2",
    };
  }
  if (
    stock.kind !== "plate" ||
    !Array.isArray(manufacturing.controllerTargets) ||
    manufacturing.controllerTargets.length === 0
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-manufacturing-capability",
      detail:
        "plate stock and at least one controller target are required",
    };
  }

  const allowedTargets = new Set([
    "generic-rs274",
    "haas-ngc",
    "linuxcnc",
  ]);
  const controllerTargets: (
    | "generic-rs274"
    | "haas-ngc"
    | "linuxcnc"
  )[] = [];
  for (const target of manufacturing.controllerTargets) {
    if (typeof target !== "string" || !allowedTargets.has(target)) {
      return {
        _tag: "Unsupported",
        code: "unsupported-controller-target",
        detail: "unsupported controller target " + String(target),
      };
    }
    controllerTargets.push(
      target as "generic-rs274" | "haas-ngc" | "linuxcnc",
    );
  }

  if (!Array.isArray(sourceRoot.keepOuts)) {
    return {
      _tag: "CompileError",
      code: "invalid-keepouts",
      detail: "keepOuts must be an array",
    };
  }
  const keepOuts: CircularKeepOut[] = [];
  for (const [index, item] of sourceRoot.keepOuts.entries()) {
    const value = record(item);
    const center = value === undefined ? undefined : record(value.center);
    const keepOutId = value === undefined ? undefined : nonEmpty(value.id);
    const x = center === undefined ? undefined : finite(center.x);
    const y = center === undefined ? undefined : finite(center.y);
    const diameterMm =
      value === undefined ? undefined : positive(value.diameterMm);
    if (
      value?.kind !== "circle-through" ||
      keepOutId === undefined ||
      x === undefined ||
      y === undefined ||
      diameterMm === undefined
    ) {
      return {
        _tag: "CompileError",
        code: "invalid-keepout",
        detail: "keepOuts[" + index + "] is invalid",
      };
    }
    keepOuts.push({
      kind: "circle-through",
      id: keepOutId,
      center: { x, y },
      diameterMm,
    });
  }

  if (!Array.isArray(sourceRoot.loadCases) || sourceRoot.loadCases.length !== 1) {
    return {
      _tag: "CompileError",
      code: "invalid-load-cases",
      detail: "v0.2 requires exactly one load case",
    };
  }
  const loadRaw = record(sourceRoot.loadCases[0]);
  const loadId = loadRaw === undefined ? undefined : nonEmpty(loadRaw.id);
  const interfaceId =
    loadRaw === undefined ? undefined : nonEmpty(loadRaw.interfaceId);
  const forceN = loadRaw === undefined ? undefined : finite(loadRaw.forceN);
  if (
    loadId === undefined ||
    interfaceId === undefined ||
    forceN === undefined ||
    loadRaw?.axis !== "z"
  ) {
    return {
      _tag: "CompileError",
      code: "invalid-load-case",
      detail: "load case requires id/interfaceId/finite forceN/axis=z",
    };
  }

  const maxMassRaw = requirements.maxMassG;
  const maxMassG =
    maxMassRaw === undefined ? undefined : positive(maxMassRaw);
  if (maxMassRaw !== undefined && maxMassG === undefined) {
    return {
      _tag: "CompileError",
      code: "invalid-mass-limit",
      detail: "maxMassG must be positive when provided",
    };
  }

  if (!Array.isArray(sourceRoot.objectives) || sourceRoot.objectives.length === 0) {
    return {
      _tag: "CompileError",
      code: "invalid-objectives",
      detail: "at least one objective is required",
    };
  }
  const objectives: DesignObjective[] = [];
  for (const [index, item] of sourceRoot.objectives.entries()) {
    const value = record(item);
    const priority = value === undefined ? undefined : positive(value.priority);
    if (
      value === undefined ||
      priority === undefined ||
      (value.kind !== "minimize-mass" &&
        value.kind !== "minimize-cycle-proxy")
    ) {
      return {
        _tag: "CompileError",
        code: "invalid-objective",
        detail: "objectives[" + index + "] is invalid",
      };
    }
    objectives.push({ kind: value.kind, priority });
  }

  const problem: DesignProblem = {
    schema: "gmr.design-problem/v1",
    id,
    units: "mm-N-MPa",
    interfaces: {
      mount: {
        id: nonEmpty(mount.id) ?? "mount",
        datum: "A",
        mountHoleDiameterMm: mountHoleDiameterMm!,
        mountHoleXFromDatumMm: mountHoleXFromDatumMm!,
        mountHoleSpacingMm: mountHoleSpacingMm!,
      },
      payload: {
        id: nonEmpty(payload.id) ?? "payload",
        boreDiameterMm: boreDiameterMm!,
        axisXFromDatumMm: axisXFromDatumMm!,
        endMarginMm: endMarginMm!,
      },
    },
    keepOuts,
    loadCases: [{ id: loadId, interfaceId, forceN, axis: "z" }],
    requirements: {
      maxTipDeflectionMm: maxTipDeflectionMm!,
      minStaticFactorOfSafety: minStaticFactorOfSafety!,
      minEdgeDistanceMm: minEdgeDistanceMm!,
      ...(maxMassG === undefined ? {} : { maxMassG }),
    },
    material: {
      id: nonEmpty(material.id) ?? "material",
      label: nonEmpty(material.label) ?? "material",
      youngsModulusMPa: youngsModulusMPa!,
      poissonRatio: poissonRatio!,
      densityKgPerM3: densityKgPerM3!,
      yieldStrengthMPa: yieldStrengthMPa!,
      basis: nonEmpty(material.basis) ?? "unspecified basis",
    },
    manufacturing: {
      process: "three-axis-milling",
      maxSetups: manufacturing.maxSetups,
      minimumProfileToolDiameterMm: minimumProfileToolDiameterMm!,
      stock: {
        kind: "plate",
        maxXmm: maxXmm!,
        maxYmm: maxYmm!,
        maxZmm: maxZmm!,
      },
      controllerTargets,
    },
    grammar: {
      family: "tapered-plate-arm",
      thicknessMm: thickness.value,
      rootHalfWidthMm: rootWidth.value,
      armHalfWidthMm: armWidth.value,
      tipHalfWidthMm: tipWidth.value,
      ...(rootButtressLength === undefined
        ? {}
        : { rootButtressLengthMm: rootButtressLength.value }),
    },
    objectives,
  };

  return {
    _tag: "Compiled",
    value: problem,
    digest: semanticDigest(problem),
  };
}
