import '../bot-audit/runtime.mjs';
import { parentPort, workerData } from 'node:worker_threads';
if (Object.keys(process.env).some(key => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key))) throw new Error('Credential in offline worker');
globalThis.fetch = () => { throw new Error('Offline network forbidden'); };
const { evaluate } = await import('./experiment.ts');
parentPort.postMessage(await evaluate(workerData));
