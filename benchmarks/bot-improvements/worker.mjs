import '../bot-audit/runtime.mjs';
import { parentPort,workerData } from 'node:worker_threads';
globalThis.fetch = () => { throw new Error('Offline network forbidden'); };
const { compare } = await import('./offline.ts');
parentPort.postMessage(await compare(...workerData));
