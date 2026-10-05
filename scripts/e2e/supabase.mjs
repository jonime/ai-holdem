import { run } from "./process.mjs";
import { localEnvironment } from "./local-environment.mjs";

const stop = process.argv[2] === "stop";
if (!stop && !process.env.CI) throw new Error("Disposable Supabase setup is CI-only; locally use supabase start and apply migrations.");
await run("supabase", stop ? ["stop", "--no-backup"] : ["start"], {
  phase: stop ? "supabase-stop" : "supabase-start", timeout: stop ? 90_000 : 480_000,
  discardStdout: true,
});
if (!stop) {
  const env = { ...process.env, ...localEnvironment() };
  // CI owns this disposable stack. Ordinary smoke commands never reset a database.
  await run("supabase", ["db", "reset", "--local", "--yes"], { env, phase: "migrations", timeout: 180_000, discardStdout: true });
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Local Supabase HTTP health failed (${response.status}).`);
  console.log("Local Supabase started with health checks enabled and committed migrations applied.");
}
