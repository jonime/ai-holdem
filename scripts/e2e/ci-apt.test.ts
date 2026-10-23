import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { aptDownloadConfiguration, configureCIApt, ubuntuSourcesOverHTTPS } from "./ci-apt.mjs";

const runnerEnv = { CI: "true", GITHUB_ACTIONS: "true", NODE_ENV: "test" as const };

const source = `Types: deb
URIs: http://azure.archive.ubuntu.com/ubuntu/
Suites: noble noble-updates noble-backports
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: http://security.ubuntu.com/ubuntu/
Suites: noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ci-apt-test-"));
  mkdirSync(join(directory, "sources.list.d"));
  mkdirSync(join(directory, "apt.conf.d"));
  writeFileSync(join(directory, "sources.list.d/ubuntu.sources"), source);
  writeFileSync(join(directory, "sources.list.d/vendor.list"), "deb https://packages.example.test stable main\n");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("replaces archive endpoints, preserving suites, signing keys and unrelated sources", () => {
  configureCIApt(directory, runnerEnv, "linux");
  const updated = readFileSync(join(directory, "sources.list.d/ubuntu.sources"), "utf8");
  expect(updated).toBe(source.replace("http://azure.archive.ubuntu.com", "https://archive.ubuntu.com")
    .replace("http://security.ubuntu.com", "https://security.ubuntu.com"));
  expect(readFileSync(join(directory, "sources.list.d/vendor.list"), "utf8"))
    .toBe("deb https://packages.example.test stable main\n");
  expect(readFileSync(join(directory, "apt.conf.d/zzzz-ai-holdem-downloads"), "utf8"))
    .toBe(aptDownloadConfiguration);
  expect(aptDownloadConfiguration).toContain('Acquire::Retries "2";');
  expect(aptDownloadConfiguration).toContain('Acquire::http::Timeout "30";');
  expect(aptDownloadConfiguration).toContain('Acquire::https::Timeout "30";');
  configureCIApt(directory, runnerEnv, "linux");
  expect(readFileSync(join(directory, "sources.list.d/ubuntu.sources"), "utf8")).toBe(updated);
});

it("handles the hosted runner mirror list and already configured HTTPS archives", () => {
  const mirrors = source.replace("http://azure.archive.ubuntu.com/ubuntu/", "mirror+file:/etc/apt/apt-mirrors.txt");
  const updated = ubuntuSourcesOverHTTPS(mirrors);
  expect(updated).toContain("URIs: https://archive.ubuntu.com/ubuntu/");
  expect(updated).not.toContain("mirror+file:");
  expect(ubuntuSourcesOverHTTPS(updated)).toBe(updated);
});

it.each([
  { CI: "false", GITHUB_ACTIONS: "true", platform: "linux" },
  { CI: "true", GITHUB_ACTIONS: "false", platform: "linux" },
  { CI: "true", GITHUB_ACTIONS: "true", platform: "darwin" },
] as const)("rejects non-runner execution before writing: %j", ({ platform, ...env }) => {
  expect(() => configureCIApt(directory, { ...runnerEnv, ...env }, platform)).toThrow("only for the Ubuntu GitHub Actions");
  expect(readFileSync(join(directory, "sources.list.d/ubuntu.sources"), "utf8")).toBe(source);
  expect(existsSync(join(directory, "apt.conf.d/zzzz-ai-holdem-downloads"))).toBe(false);
});

it.each([source.replace("http://security.ubuntu.com/ubuntu/", "https://unexpected.example/ubuntu"), "Types: deb\n"])(
  "fails before writes when the runner source layout is unexpected", invalid => {
    writeFileSync(join(directory, "sources.list.d/ubuntu.sources"), invalid);
    expect(() => configureCIApt(directory, runnerEnv, "linux")).toThrow();
    expect(readFileSync(join(directory, "sources.list.d/ubuntu.sources"), "utf8")).toBe(invalid);
    expect(existsSync(join(directory, "apt.conf.d/zzzz-ai-holdem-downloads"))).toBe(false);
  },
);
