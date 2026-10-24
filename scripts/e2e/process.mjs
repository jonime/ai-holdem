import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export async function run(command, args, { cwd = process.cwd(), env = process.env, phase, timeout, discardStdout = false, gracefulStop = false, stopTree = null, killAfter = 10_000 }) {
  const directory = resolve(process.env.E2E_LOG_DIR ?? "integration-logs");
  mkdirSync(directory, { recursive: true });
  const secrets = Object.entries(env).filter(([name, value]) => /KEY|TOKEN|PASSWORD|SECRET/.test(name) && value).map(([, value]) => value);
  const sanitize = text => {
    for (const secret of secrets) text = text.split(secret).join("[redacted]");
    return text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted-jwt]")
      .replace(/sb_(?:secret|publishable)_[\w-]+/g, "[redacted-key]")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted-db-url]")
      .split("\n").filter(line => !/password|service.role|anon.key|secret.key|DATABASE_URL|INSERT INTO|COPY public\./i.test(line)).join("\n");
  };
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const signalGroup = signal => { try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== "ESRCH") throw error;
  } };
  let killTimer;
  let stopping;
  const stop = () => {
    if (stopping) return;
    // Escalation is relative to the first stop request, including cancellation.
    if (!stopTree) killTimer = setTimeout(() => signalGroup("SIGKILL"), killAfter);
    stopping = Promise.resolve().then(async () => {
      if (stopTree) await stopTree(child);
      else signalGroup("SIGTERM");
    });
    // Observe immediately; report cleanup failure after the child has closed.
    stopping.catch(() => {});
  };
  let pending = "";
  const output = chunk => {
    pending += chunk.toString();
    const end = pending.lastIndexOf("\n");
    if (end < 0) return;
    const safe = sanitize(pending.slice(0, end + 1));
    pending = pending.slice(end + 1);
    appendFileSync(joinLog(), safe);
    process.stdout.write(safe);
  };
  const joinLog = () => resolve(directory, `${phase}.log`);
  if (!discardStdout) child.stdout.on("data", output);
  else child.stdout.resume();
  child.stderr.on("data", output);
  let interrupted = false;
  const interrupt = () => { interrupted = true; stop(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
  try {
    await new Promise((resolve, reject) => {
      child.on("error", () => reject(new Error(`${phase} could not start`)));
      child.on("close", code => (interrupted ? gracefulStop : code === 0) && !timedOut ? resolve() : reject(new Error(`${phase} failed${timedOut ? " (timeout)" : ` (exit ${code})`}`)));
    });
  } finally {
    try {
      if (stopping) await stopping;
    } finally {
      clearTimeout(timer); clearTimeout(killTimer);
      process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
      if (!stopTree) signalGroup("SIGTERM");
      if (pending) appendFileSync(joinLog(), sanitize(pending));
    }
  }
}
