import './runtime.mjs';
import { parentPort, workerData } from 'node:worker_threads';
if(process.env.EXTERNAL_INFERENCE_ENABLED!=='false') throw new Error('Offline worker must disable inference');
globalThis.fetch=()=>{throw new Error('Offline network is forbidden');};
const { partition } = await import('./offline-equity.ts');
parentPort.postMessage({rows:await partition(workerData.partition,workerData.count,nodes=>parentPort.postMessage({progress:nodes}))});
