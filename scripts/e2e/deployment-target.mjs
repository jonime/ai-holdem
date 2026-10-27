const vercelActor = actor => actor?.login === "vercel[bot]" && actor?.type === "Bot";
const runId = value => typeof value === "string" && value.trim() === value && /^[1-9]\d*$/.test(value);
const repositoryName = value => typeof value === "string" && value.trim() === value && /^[\w.-]+\/[\w.-]+$/.test(value);

export function deploymentURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Expected an immutable HTTPS Vercel deployment origin.");
  }
  return url.origin;
}

/** Project/environment/URL/revision assertions use the authenticated Vercel event. */
export function validateDeployment(record, { projectId, repository }) {
  if (!projectId || !repositoryName(repository) || record?.schemaVersion !== 1 ||
      record?.repository !== repository || record?.projectId !== projectId ||
      record?.environment !== "production" || record?.state !== "success" ||
      typeof record?.deploymentId !== "string" || record.deploymentId.trim() !== record.deploymentId ||
      !/^dpl_[a-zA-Z0-9]+$/.test(record.deploymentId) ||
      typeof record?.sha !== "string" || record.sha.length !== 40 || !/^[a-f0-9]{40}$/.test(record.sha) ||
      !runId(record?.sourceRunId) || !runId(record?.sourceRunAttempt)) {
    throw new Error("Deployment does not match the approved production project, repository and revision.");
  }
  return {
    schemaVersion: 1, repository, projectId, environment: "production", state: "success",
    deploymentId: record.deploymentId, url: deploymentURL(record.url), sha: record.sha,
    sourceRunId: record.sourceRunId, sourceRunAttempt: record.sourceRunAttempt,
  };
}

export function resolveDeployment(event, env, recordedTarget) {
  const approved = { projectId: env.PRODUCTION_VERCEL_PROJECT_ID, repository: env.GITHUB_REPOSITORY };
  if (env.GITHUB_EVENT_NAME === "repository_dispatch") {
    if (event?.action !== "vercel.deployment.success" || !vercelActor(event?.sender) ||
        env.GITHUB_ACTOR !== "vercel[bot]" || event?.repository?.full_name !== approved.repository) {
      throw new Error("Only Vercel's authenticated deployment success dispatch is accepted.");
    }
    const payload = event.client_payload;
    return validateDeployment({
      schemaVersion: 1, repository: event.repository.full_name, projectId: payload?.project?.id,
      environment: payload?.environment, state: payload?.state?.type, deploymentId: payload?.id,
      url: payload?.url, sha: payload?.git?.sha,
      sourceRunId: env.GITHUB_RUN_ID, sourceRunAttempt: env.GITHUB_RUN_ATTEMPT,
    }, approved);
  }
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch" || !runId(event?.inputs?.run_id) ||
      event.inputs.run_id !== env.SOURCE_RUN_ID || !runId(env.SOURCE_RUN_ATTEMPT)) {
    throw new Error("Manual smoke requires an approved Vercel source run.");
  }
  const target = validateDeployment(recordedTarget, approved);
  if (target.sourceRunId !== env.SOURCE_RUN_ID || target.sourceRunAttempt !== env.SOURCE_RUN_ATTEMPT) {
    throw new Error("Recorded target does not belong to the approved source run and attempt.");
  }
  return target;
}

/** Authenticate artifact provenance with GitHub's automatic token, never a Vercel token. */
export async function resolveSourceRun(event, env, request = fetch) {
  const id = event?.inputs?.run_id;
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch" || !runId(id) ||
      !repositoryName(env.GITHUB_REPOSITORY) || !env.GITHUB_TOKEN) {
    throw new Error("A source run ID and automatic GitHub token are required.");
  }
  const response = await request(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${id}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Source run lookup failed (${response.status}).`);
  const run = await response.json();
  if (String(run?.id) !== id || run?.repository?.full_name !== env.GITHUB_REPOSITORY ||
      run?.event !== "repository_dispatch" || !vercelActor(run?.actor) ||
      run?.path !== ".github/workflows/production-smoke.yml" || run?.head_branch !== "main" ||
      run?.status !== "completed" || !runId(String(run?.run_attempt ?? ""))) {
    throw new Error("Source must be a completed Vercel-triggered production smoke workflow in this repository.");
  }
  // A failed smoke is retryable only if its target-validation artifact exists.
  return { id, attempt: String(run.run_attempt) };
}
