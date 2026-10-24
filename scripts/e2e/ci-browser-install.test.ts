import { expect, it } from "vitest";
import { browserInstallOptions } from "./ci-browser-install.mjs";

it("contains the complete installer in a root-managed cgroup under the runner UID", () => {
  const options = browserInstallOptions({ NODE_ENV: "test", CI: "true", GITHUB_ACTIONS: "true", HOME: "/home/runner", PATH: "/node/bin:/usr/bin", SUPABASE_SECRET_KEY: "must-not-forward" }, "linux");
  expect(options.command).toBe("sudo");
  expect(options.args).toEqual(expect.arrayContaining([
    "-n", "systemd-run", "--wait", "--pipe", "--collect", "--service-type=exec",
    "--property=KillMode=control-group", "--property=RuntimeMaxSec=480", "--property=TimeoutStopSec=10",
    `--uid=${process.getuid!()}`, "--setenv=HOME=/home/runner", "--expand-environment=no",
  ]));
  expect(options.args.join(" ")).not.toContain("must-not-forward");
  expect(options.unit).not.toBe(browserInstallOptions({ NODE_ENV: "test", CI: "true", GITHUB_ACTIONS: "true" }, "linux").unit);
});

it("rejects local execution before launching privileged commands", () => {
  expect(() => browserInstallOptions({ NODE_ENV: "test", CI: "true" }, "linux")).toThrow("GitHub Actions");
  expect(() => browserInstallOptions({ NODE_ENV: "test", CI: "true", GITHUB_ACTIONS: "true" }, "darwin")).toThrow("GitHub Actions");
});
