/** Credential-free connectivity only; keep this module independent of experiment runners. */
export async function networkPreflight(fetcher: typeof fetch = fetch) {
  for (const url of ["https://api.typesafe.ai", "https://openrouter.ai"]) {
    let response: Response;
    try { response = await fetcher(url, { method: "HEAD", signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error("Provider connectivity preflight failed; no inference started"); }
    if (response.status === 429 || response.status >= 500) throw new Error("Provider connectivity preflight unavailable; no inference started");
  }
}
