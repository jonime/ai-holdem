import { Worker } from 'node:worker_threads';
const mode = process.argv[2] ?? 'full';
if (!['smoke', 'full', 'freeze'].includes(mode) || process.argv.length > 3) throw new Error('Use smoke, full or freeze');
// No parent environment (including NODE_OPTIONS, dotenv preload hooks or credentials) is passed.
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { env: { NODE_ENV: 'test', EXTERNAL_INFERENCE_ENABLED: 'false' }, execArgv: [], workerData: { mode } });
worker.on('message', message => console.log(message));
worker.on('error', error => { console.error(error.message); process.exitCode = 1; });
worker.on('exit', code => { if (code) process.exitCode = code; });
