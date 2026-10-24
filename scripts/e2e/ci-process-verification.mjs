// Real Ubuntu regression: root-owned detached descendants must not survive
// timeout or cancellation. Uses no network, apt, database or application secrets.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCIBrowsers } from "./ci-browser-install.mjs";
import { run } from "./process.mjs";

for (const mode of ["deadline", "timeout", "cancel"]) {
  const directory = await mkdtemp(join(tmpdir(), "ci-process-"));
  const marker = join(directory, "pid");
  let cancellation;
  try {
    const rootFixture = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(`
        require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
      `)}], { detached: true, stdio: 'inherit' });
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    `;
    const runnerFixture = `
      require('node:child_process').spawn('sudo', ['-n', ${JSON.stringify(process.execPath)}, '-e', ${JSON.stringify(rootFixture)}], { stdio: 'inherit' });
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    `;
    await assert.rejects(installCIBrowsers(process.env, async (command, args, options) => {
      const fixtureArgs = [...args.slice(0, -6), process.execPath, "-e", runnerFixture];
      // Exercise the same root-owned runtime deadline independently of Node.
      fixtureArgs[fixtureArgs.indexOf("--property=RuntimeMaxSec=480")] = "--property=RuntimeMaxSec=4";
      if (mode === "cancel") {
        cancellation = setInterval(async () => {
          try {
            await readFile(marker);
            clearInterval(cancellation);
            process.emit("SIGTERM");
          } catch { /* Wait for the root descendant before cancellation. */ }
        }, 50);
      }
      await run(command, fixtureArgs, { ...options, timeout: mode === "timeout" ? 1000 : 60_000 });
    }));
    const pid = (await readFile(marker, "utf8")).trim();
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      assert.match(stat, /\) Z /, "Root-owned descendant survived containment cleanup");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    console.log(`Privileged descendant ${mode} cleanup verified.`);
  } finally {
    clearInterval(cancellation);
    await rm(directory, { recursive: true, force: true });
  }
}
