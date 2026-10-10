import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GeometricManufacturingReplSession } from "./session.js";

async function main(): Promise<void> {
  const session = new GeometricManufacturingReplSession();
  const terminal = Boolean(input.isTTY && output.isTTY);
  const rl = createInterface({ input, output, terminal });

  output.write(
    "Geometric Manufacturing REPL — semantic preview only. Type help() for commands.\n",
  );

  if (terminal) {
    rl.setPrompt("gmr> ");
    rl.prompt();
  }

  try {
    for await (const line of rl) {
      try {
        const result = session.evaluate(line);
        if (result.kind === "exit") break;
        output.write(`${JSON.stringify(result, null, 2)}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.write(`error: ${message}\n`);
      }
      if (terminal) rl.prompt();
    }
  } finally {
    rl.close();
  }
}

await main();
