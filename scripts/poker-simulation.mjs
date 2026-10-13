import { spawnSync } from "node:child_process";
import { simulationOptions } from "../test/poker-simulation/options.mjs";

try {
  const args = process.argv.slice(2);
  simulationOptions(args);
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.poker-simulation.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, POKER_SIMULATION_ARGS: JSON.stringify(args) },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Simulation command failed");
  process.exitCode = 1;
}
