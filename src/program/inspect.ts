import type { GeneratedCapsule, ManufacturingProgram } from "../model.js";

export function inspectGeneratedGeometry(
  program: ManufacturingProgram,
  operationId: string,
): GeneratedCapsule | undefined {
  return program.geometry.find((item) => item.operationId === operationId);
}
