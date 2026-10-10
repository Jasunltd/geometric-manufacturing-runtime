import type { ControllerTarget } from "../controllers/index.js";
import type { ReplCommand } from "./contracts.js";

const MAX_INPUT_LENGTH = 256 * 1024;
const CALL = /^([A-Za-z][A-Za-z0-9_-]*)\s*\((.*)\)\s*$/s;
const TARGETS = new Set<ControllerTarget>([
  "generic-rs274",
  "haas-ngc",
  "linuxcnc",
]);

function parseArgs(text: string): readonly unknown[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const parsed: unknown = JSON.parse("[" + text + "]");
  if (!Array.isArray(parsed)) {
    throw new TypeError("REPL argument list must decode to an array");
  }
  return parsed;
}

function requireNoArgs(name: string, args: readonly unknown[]): void {
  if (args.length !== 0) {
    throw new TypeError(name + "() takes no arguments");
  }
}

export function parseReplLine(input: string): ReplCommand {
  const line = input.trim();
  if (line.length === 0) throw new TypeError("REPL input is empty");
  if (line.length > MAX_INPUT_LENGTH) {
    throw new TypeError("REPL input exceeds maximum length");
  }
  if (line === "exit" || line === "quit") return { kind: "exit" };
  if (line === "help") return { kind: "help" };

  const match = CALL.exec(line);
  if (match === null) {
    throw new TypeError(
      "REPL accepts closed function-call syntax only; arbitrary JavaScript and natural-language execution are not evaluated",
    );
  }

  const name = match[1];
  const rawArgs = match[2];
  if (name === undefined || rawArgs === undefined) {
    throw new TypeError("invalid REPL call");
  }
  const args = parseArgs(rawArgs);

  switch (name) {
    case "help":
      requireNoArgs(name, args);
      return { kind: "help" };
    case "status":
      requireNoArgs(name, args);
      return { kind: "status" };
    case "history":
      requireNoArgs(name, args);
      return { kind: "history" };
    case "exit":
    case "quit":
      requireNoArgs(name, args);
      return { kind: "exit" };
    case "problem":
      if (args.length !== 1) {
        throw new TypeError("problem(spec) requires one JSON DesignProblem");
      }
      return { kind: "problem", input: args[0] };
    case "search":
      requireNoArgs(name, args);
      return { kind: "search" };
    case "synthesize":
      requireNoArgs(name, args);
      return { kind: "synthesize" };
    case "candidates":
      if (
        args.length > 1 ||
        (args.length === 1 &&
          (typeof args[0] !== "number" ||
            !Number.isInteger(args[0]) ||
            args[0] <= 0))
      ) {
        throw new TypeError("candidates() or candidates(positiveInteger) expected");
      }
      return {
        kind: "candidates",
        limit: args.length === 0 ? 10 : (args[0] as number),
      };
    case "select":
      if (args.length !== 1 || typeof args[0] !== "string") {
        throw new TypeError('select("candidate-id") requires one JSON string');
      }
      return { kind: "select", candidateId: args[0] };
    case "inspect":
      if (
        args.length > 1 ||
        (args.length === 1 && typeof args[0] !== "string")
      ) {
        throw new TypeError('inspect() or inspect("candidate-id") expected');
      }
      return args.length === 0
        ? { kind: "inspect" }
        : { kind: "inspect", candidateId: args[0] as string };
    case "fea":
      requireNoArgs(name, args);
      return { kind: "fea" };
    case "cam":
      requireNoArgs(name, args);
      return { kind: "cam" };
    case "motion":
      requireNoArgs(name, args);
      return { kind: "motion" };
    case "post": {
      if (args.length !== 1 || typeof args[0] !== "string") {
        throw new TypeError(
          'post("haas-ngc"|"linuxcnc"|"generic-rs274") expected',
        );
      }
      const target = args[0] as ControllerTarget;
      if (!TARGETS.has(target)) {
        throw new TypeError("unsupported controller target " + target);
      }
      return { kind: "post", target };
    }
    default:
      throw new TypeError("unsupported REPL command " + name);
  }
}
