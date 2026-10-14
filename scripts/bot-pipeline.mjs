import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { botPipelineEnvironment } from './bot-pipeline-environment.mjs';

// No dotenv loaders, shell evaluation, provider credentials or user CLI overrides.
const env = botPipelineEnvironment();
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run', '--config', 'vitest.bot-pipeline.config.ts',
], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Bot pipeline test process failed to start.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
