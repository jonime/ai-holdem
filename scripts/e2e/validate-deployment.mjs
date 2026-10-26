import { readFileSync, appendFileSync } from "node:fs";
import { resolveDeployment } from "./deployment-target.mjs";

const target = await resolveDeployment(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), process.env);
appendFileSync(process.env.GITHUB_OUTPUT, `url=${target.url}\nsha=${target.sha}\n`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Production smoke target: ${target.url}\n\nDeployed revision: ${target.sha}\n`);
