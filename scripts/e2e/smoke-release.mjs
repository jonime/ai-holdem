import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, readdirSync } from "node:fs";
import { verifyRevision, PUBLIC_ORIGIN } from "./production-revision.mjs";
import { deploymentURL } from "./deployment-target.mjs";

if (process.argv[2] === "preflight") {
  await verifyRevision(process.env.PRODUCTION_SMOKE_SHA, { timeout: 60_000 });
} else if (process.argv[2] === "report") {
  const expected = /^[a-f0-9]{40}$/.test(process.env.PRODUCTION_SMOKE_SHA ?? "") ? process.env.PRODUCTION_SMOKE_SHA : "unknown";
  let deployment = "unvalidated";
  try { deployment = deploymentURL(process.env.PRODUCTION_SMOKE_DEPLOYMENT_URL); } catch { /* Failed validation has no trusted URL. */ }
  const path = process.env.PRODUCTION_SMOKE_REVISION_LOG;
  const events = path && existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const observed = events.at(-1)?.observed;
  const safeObserved = /^[a-f0-9]{40}$/.test(observed ?? "") ? observed : "unknown";
  const revisionFailure = events.some(event => event.category !== "verified");
  const accessFailure = events.some(event => event.category === "access failure");
  const journeyReports = existsSync("smoke-diagnostics") ? readdirSync("smoke-diagnostics", { recursive: true })
    .filter(file => String(file).endsWith("journey-summary.txt"))
    .map(file => readFileSync(`smoke-diagnostics/${file}`, "utf8")) : [];
  const cleanupFailed = journeyReports.some(text => text.includes("Cleanup: failed"));
  const journeyFailed = journeyReports.some(text => text.includes("Journey: failed"));
  const cleanupPassed = journeyReports.length === 3 && journeyReports.every(text => text.includes("Cleanup: passed"));
  const smokePassed = cleanupPassed && process.env.SMOKE_OUTCOME === "success" && process.env.PREFLIGHT_OUTCOME === "success" && !revisionFailure;
  const summary = [
    `Production smoke: ${smokePassed ? "passed (three journeys; owned tables removed)" : "release could not be verified"}`,
    `Expected revision: ${expected}`, `Observed revision: ${safeObserved}`,
    `Public test origin: ${PUBLIC_ORIGIN}`, `Original deployment URL: ${deployment}`,
    `Access failures: ${accessFailure ? "yes" : "none recorded"}`,
    `Revision verification: ${revisionFailure ? "release not verified: production revision mismatch" : events.length ? "matched at recorded boundaries" : "not reached"}`,
    `Journey failures: ${journeyFailed ? "yes" : "none recorded"}`,
    `Cleanup: ${cleanupFailed ? "failed; see cleanup-summary.txt" : cleanupPassed ? "all three owned tables removed" : "not completed for all three journeys"}`,
    "Failure requires release investigation; no automatic rollback runs.",
  ].join("\n") + "\n";
  mkdirSync("smoke-diagnostics", { recursive: true });
  writeFileSync("smoke-diagnostics/summary.txt", summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else throw new Error("Expected preflight or report.");
