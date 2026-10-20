import './isolation.mjs';
import {parentPort} from 'node:worker_threads';
if(Object.keys(process.env).some(k=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))) throw new Error('Credential in offline worker');
const {evaluate}=await import('./experiment.ts');
parentPort.on('message',async job=>{
  try{parentPort.postMessage({result:await evaluate(job.spec,job.selection)});}
  catch(error){parentPort.postMessage({error:error instanceof Error?error.message:'Worker failed'});}
});
parentPort.postMessage({ready:true});
