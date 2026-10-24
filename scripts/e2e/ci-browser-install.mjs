import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { run } from "./process.mjs";

// A process group cannot contain sudo's new sessions or signal root-owned apt.
// systemd owns the cgroup and its deadline, independently of this Node process.
export function browserInstallOptions(env = process.env, platform = process.platform) {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || platform !== "linux") {
    throw new Error("Browser containment requires the Ubuntu GitHub Actions runner.");
  }
  const unit = `ai-holdem-browser-${randomUUID()}.service`;
  const args = ["-n", "systemd-run", "--quiet", "--wait", "--pipe", "--collect", `--unit=${unit}`,
    "--service-type=exec", `--uid=${process.getuid()}`, `--gid=${process.getgid()}`,
    `--working-directory=${process.cwd()}`, "--property=KillMode=control-group",
    "--property=RuntimeMaxSec=480", "--property=TimeoutStopSec=10", "--expand-environment=no"];
  // Preserve the runner's browser cache and Node path without forwarding application secrets.
  for (const name of ["HOME", "PATH", "CI", "PLAYWRIGHT_BROWSERS_PATH"]) {
    if (env[name]) args.push(`--setenv=${name}=${env[name]}`);
  }
  args.push(process.execPath, resolve("node_modules/@playwright/test/cli.js"), "install", "--with-deps", "chromium", "webkit");
  return { command: "sudo", args, unit };
}

export async function installCIBrowsers(env = process.env, runCommand = run, platform = process.platform) {
  const { command, args, unit } = browserInstallOptions(env, platform);
  const stopOnce = () => new Promise((resolveStop, reject) => {
    const stop = spawn("sudo", ["-n", "systemctl", "stop", unit], { stdio: "ignore", timeout: 20_000 });
    stop.once("error", () => reject(new Error("Browser cgroup cleanup could not start.")));
    stop.once("close", code => code === 0 || code === 5
      ? resolveStop(code) : reject(new Error("Browser cgroup cleanup failed.")));
  });
  const stopTree = async child => {
    const deadline = Date.now() + 20_000;
    // Cancellation may arrive while systemd-run is still registering the unit.
    // A missing unit is final only once the launcher has exited.
    while (await stopOnce() === 5 && child.exitCode === null && child.signalCode === null) {
      if (Date.now() >= deadline) throw new Error("Browser cgroup registration did not settle.");
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
  };
  await runCommand(command, args, { env, phase: "browser-install", timeout: 480_000, stopTree });
}
