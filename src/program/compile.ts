import type {
  BoxStock,
  CapsuleSweepOperation,
  CompileResult,
  FlatEndMillTool,
  GeneratedCapsule,
  ManufacturingProgram,
  ManufacturingProgramDefinition,
  Point2,
} from "../model.js";
import { semanticDigest } from "../integrity/canonical.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function decodePoint(value: unknown, path: string): CompileResult<Point2> {
  const source = record(value);
  if (source === undefined) {
    return { _tag: "CompileError", code: "invalid-point", detail: `${path} must be an object` };
  }
  const x = finiteNumber(source.x);
  const y = finiteNumber(source.y);
  if (x === undefined || y === undefined) {
    return { _tag: "CompileError", code: "invalid-point", detail: `${path}.x and .y must be finite numbers` };
  }
  const valueOut: Point2 = { x, y };
  return { _tag: "Compiled", value: valueOut, digest: semanticDigest(valueOut) };
}

function decodeStock(value: unknown): CompileResult<BoxStock> {
  const source = record(value);
  if (source === undefined || source.kind !== "box") {
    return { _tag: "Unsupported", code: "unsupported-stock", detail: "v0.1 supports only box stock" };
  }
  const sizeX = positiveNumber(source.sizeX);
  const sizeY = positiveNumber(source.sizeY);
  const sizeZ = positiveNumber(source.sizeZ);
  if (sizeX === undefined || sizeY === undefined || sizeZ === undefined) {
    return { _tag: "CompileError", code: "invalid-stock", detail: "box stock dimensions must be positive finite numbers" };
  }
  const stock: BoxStock = { kind: "box", sizeX, sizeY, sizeZ };
  return { _tag: "Compiled", value: stock, digest: semanticDigest(stock) };
}

function decodeTool(value: unknown, index: number): CompileResult<FlatEndMillTool> {
  const source = record(value);
  if (source === undefined || source.kind !== "flat-end-mill") {
    return { _tag: "Unsupported", code: "unsupported-tool", detail: `tools[${index}] must be a flat-end-mill in v0.1` };
  }
  const id = nonEmptyString(source.id);
  const nominalDiameter = positiveNumber(source.nominalDiameter);
  if (id === undefined || nominalDiameter === undefined) {
    return { _tag: "CompileError", code: "invalid-tool", detail: `tools[${index}] requires id and positive nominalDiameter` };
  }
  const tool: FlatEndMillTool = { kind: "flat-end-mill", id, nominalDiameter };
  return { _tag: "Compiled", value: tool, digest: semanticDigest(tool) };
}

function decodeOperation(
  value: unknown,
  index: number,
  toolIds: ReadonlySet<string>,
): CompileResult<CapsuleSweepOperation> {
  const source = record(value);
  if (source === undefined || source.kind !== "capsule-sweep") {
    return { _tag: "Unsupported", code: "unsupported-operation", detail: `operations[${index}] must be capsule-sweep in v0.1` };
  }
  if ("radius" in source || "width" in source || "cornerRadius" in source) {
    return {
      _tag: "CompileError",
      code: "independent-generated-dimension-forbidden",
      detail: `operations[${index}] may not author radius/width/cornerRadius; generated dimensions are consequences of the referenced tool`,
    };
  }

  const id = nonEmptyString(source.id);
  const toolId = nonEmptyString(source.toolId);
  const topZ = finiteNumber(source.topZ);
  const bottomZ = finiteNumber(source.bottomZ);
  const maxRadialCompensation = positiveNumber(source.maxRadialCompensation);
  const start = decodePoint(source.start, `operations[${index}].start`);
  const end = decodePoint(source.end, `operations[${index}].end`);

  if (id === undefined || toolId === undefined || topZ === undefined || bottomZ === undefined || maxRadialCompensation === undefined) {
    return { _tag: "CompileError", code: "invalid-operation", detail: `operations[${index}] has invalid scalar fields` };
  }
  if (!toolIds.has(toolId)) {
    return { _tag: "CompileError", code: "unknown-tool", detail: `operations[${index}] references unknown tool ${toolId}` };
  }
  if (start._tag !== "Compiled") return start;
  if (end._tag !== "Compiled") return end;
  if (start.value.x === end.value.x && start.value.y === end.value.y) {
    return { _tag: "CompileError", code: "zero-length-path", detail: `operations[${index}] start and end must differ` };
  }
  if (!(topZ > bottomZ)) {
    return { _tag: "CompileError", code: "invalid-depth", detail: `operations[${index}] requires topZ > bottomZ` };
  }

  const operation: CapsuleSweepOperation = {
    kind: "capsule-sweep",
    id,
    toolId,
    start: start.value,
    end: end.value,
    topZ,
    bottomZ,
    maxRadialCompensation,
  };
  return { _tag: "Compiled", value: operation, digest: semanticDigest(operation) };
}

function deriveCapsule(
  operation: CapsuleSweepOperation,
  tool: FlatEndMillTool,
): GeneratedCapsule {
  const dx = operation.end.x - operation.start.x;
  const dy = operation.end.y - operation.start.y;
  const pathLength = Math.hypot(dx, dy);
  const radius = tool.nominalDiameter / 2;
  const planarArea = pathLength * tool.nominalDiameter + Math.PI * radius * radius;
  const depth = operation.topZ - operation.bottomZ;
  return {
    kind: "generated-capsule",
    operationId: operation.id,
    toolId: tool.id,
    start: operation.start,
    end: operation.end,
    topZ: operation.topZ,
    bottomZ: operation.bottomZ,
    radius,
    width: tool.nominalDiameter,
    pathLength,
    planarArea,
    removedVolume: planarArea * depth,
  };
}

export function compileManufacturingProgram(input: unknown): CompileResult<ManufacturingProgram> {
  const source = record(input);
  if (source === undefined) {
    return { _tag: "CompileError", code: "invalid-program", detail: "program input must be an object" };
  }
  if (source.schema !== "gmr.program/v1") {
    return { _tag: "Unsupported", code: "unsupported-schema", detail: "expected schema gmr.program/v1" };
  }
  const id = nonEmptyString(source.id);
  if (id === undefined) {
    return { _tag: "CompileError", code: "invalid-id", detail: "program id must be a non-empty string" };
  }
  if (source.units !== "mm") {
    return { _tag: "Unsupported", code: "unsupported-units", detail: "v0.1 supports millimeters only" };
  }

  const stock = decodeStock(source.stock);
  if (stock._tag !== "Compiled") return stock;

  if (!Array.isArray(source.tools) || source.tools.length === 0) {
    return { _tag: "CompileError", code: "invalid-tools", detail: "program requires at least one tool" };
  }
  const tools: FlatEndMillTool[] = [];
  const toolIds = new Set<string>();
  for (const [index, raw] of source.tools.entries()) {
    const decoded = decodeTool(raw, index);
    if (decoded._tag !== "Compiled") return decoded;
    if (toolIds.has(decoded.value.id)) {
      return { _tag: "CompileError", code: "duplicate-tool-id", detail: `duplicate tool id ${decoded.value.id}` };
    }
    toolIds.add(decoded.value.id);
    tools.push(decoded.value);
  }

  if (!Array.isArray(source.operations) || source.operations.length === 0) {
    return { _tag: "CompileError", code: "invalid-operations", detail: "program requires at least one operation" };
  }
  const operations: CapsuleSweepOperation[] = [];
  const operationIds = new Set<string>();
  for (const [index, raw] of source.operations.entries()) {
    const decoded = decodeOperation(raw, index, toolIds);
    if (decoded._tag !== "Compiled") return decoded;
    if (operationIds.has(decoded.value.id)) {
      return { _tag: "CompileError", code: "duplicate-operation-id", detail: `duplicate operation id ${decoded.value.id}` };
    }
    operationIds.add(decoded.value.id);
    operations.push(decoded.value);
  }

  const definition: ManufacturingProgramDefinition = {
    schema: "gmr.program/v1",
    id,
    units: "mm",
    stock: stock.value,
    tools,
    operations,
  };

  const toolById = new Map(tools.map((tool) => [tool.id, tool] as const));
  const geometry = operations.map((operation) => {
    const tool = toolById.get(operation.toolId);
    if (tool === undefined) {
      throw new TypeError(`compiled operation lost tool binding ${operation.toolId}`);
    }
    return deriveCapsule(operation, tool);
  });

  const definitionDigest = semanticDigest(definition);
  const geometryDigest = semanticDigest({ stock: definition.stock, geometry });
  const program: ManufacturingProgram = {
    schema: "gmr.compiled-program/v1",
    definition,
    geometry,
    definitionDigest,
    geometryDigest,
  };

  return { _tag: "Compiled", value: program, digest: definitionDigest };
}
