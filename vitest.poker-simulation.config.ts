import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { simulationCases, simulationOptions } from "./test/poker-simulation/options.mjs";

const args: unknown = JSON.parse(process.env.POKER_SIMULATION_ARGS ?? "[]");
if (!Array.isArray(args) || args.some(arg => typeof arg !== "string")) throw new Error("Invalid simulation arguments");

// No application environment file or benchmark/provider setup is loaded here.
export default defineConfig({
  test: {
    include: ["test/poker-simulation/full-game.test.ts"],
    passWithNoTests: false,
    provide: { pokerSimulationCases: simulationCases(simulationOptions(args)) },
  },
  resolve: { alias: {
    "@": fileURLToPath(new URL("./", import.meta.url)),
    "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
  } },
});
