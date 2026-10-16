import '../bot-audit/runtime.mjs';
import {parentPort,workerData} from 'node:worker_threads';
if(Object.keys(process.env).some(k=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))) throw new Error('Credential in offline worker');
globalThis.fetch=()=>{throw new Error('Offline network forbidden');};
const {evaluate,fixed}=await import('./experiment.ts');
parentPort.on('message',async job=>{
  try {
    const result=job.kind==='fixed'?await fixed(workerData.smoke?8:5000):await evaluate(job.spec,job.selection,workerData.smoke?8:5000);
    parentPort.postMessage({result});
  } catch(error) { parentPort.postMessage({error:error instanceof Error?error.message:'Worker failed'}); }
});
parentPort.postMessage({ready:true});
