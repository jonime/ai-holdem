import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolveDeployment, resolveSourceRun } from "./deployment-target.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
if (process.argv[2] === "source") {
  const source = await resolveSourceRun(event, process.env);
  appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${source.id}\nattempt=${source.attempt}\n`);
} else {
  const recorded = process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    ? JSON.parse(readFileSync("production-smoke-target/target.json", "utf8")) : undefined;
  const target = resolveDeployment(event, process.env, recorded);
  if (process.env.GITHUB_EVENT_NAME === "repository_dispatch") {
    mkdirSync("validated-production-target", { recursive: true });
    writeFileSync("validated-production-target/target.json", JSON.stringify(target));
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${target.url}\nsha=${target.sha}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Production smoke target: ${target.url}\n\nDeployed revision: ${target.sha}\n\nValidated source run: ${target.sourceRunId} (attempt ${target.sourceRunAttempt})\n`);
}
