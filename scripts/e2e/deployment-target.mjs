export function deploymentURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Expected an immutable HTTPS Vercel deployment origin.");
  }
  return url.origin;
}

export function validateDeployment(deployment, { projectId, repository, url, sha }) {
  const origin = deploymentURL(url);
  const revision = deployment?.meta?.githubCommitSha;
  if (!projectId || deployment?.projectId !== projectId || deployment?.target !== "production" ||
      deployment?.readyState !== "READY" || deploymentURL(`https://${deployment?.url}`) !== origin ||
      !/^[a-f0-9]{40}$/.test(revision ?? "") ||
      `${deployment?.meta?.githubCommitOrg}/${deployment?.meta?.githubCommitRepo}` !== repository ||
      (sha && sha !== revision)) throw new Error("Deployment does not match the approved production project, repository, URL and revision.");
  return { url: origin, sha: revision };
}

export async function resolveDeployment(event, env, request = fetch) {
  const manual = env.GITHUB_EVENT_NAME === "workflow_dispatch";
  if (!manual && (env.GITHUB_EVENT_NAME !== "repository_dispatch" || event.action !== "vercel.deployment.success")) {
    throw new Error("Unexpected deployment event.");
  }
  const payload = manual ? event.inputs : event.client_payload;
  if (!manual && (payload?.environment !== "production" || payload?.project?.id !== env.PRODUCTION_VERCEL_PROJECT_ID || payload?.state?.type !== "success")) throw new Error("Preview or unrelated deployments are forbidden.");
  const sha = manual ? payload?.sha : payload?.git?.sha;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("A complete deployed commit is required.");
  const url = deploymentURL(payload?.url);
  if (!env.VERCEL_READ_TOKEN || !env.PRODUCTION_VERCEL_PROJECT_ID) throw new Error("Production validation configuration is missing.");
  const api = new URL(`https://api.vercel.com/v13/deployments/${new URL(url).hostname}`);
  if (env.PRODUCTION_VERCEL_TEAM_ID) api.searchParams.set("teamId", env.PRODUCTION_VERCEL_TEAM_ID);
  const response = await request(api, { headers: { Authorization: `Bearer ${env.VERCEL_READ_TOKEN}` }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Deployment metadata lookup failed (${response.status}).`);
  return validateDeployment(await response.json(), { projectId: env.PRODUCTION_VERCEL_PROJECT_ID, repository: env.GITHUB_REPOSITORY, url, sha });
}
