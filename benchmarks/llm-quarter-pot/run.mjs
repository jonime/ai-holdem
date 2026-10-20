// Coordinator inherits no application imports. Only the child sees benchmark modules.
import { Worker } from 'node:worker_threads';
const mode=process.argv[2]??'smoke';
if(process.argv.length>3||!['smoke','full','analyze'].includes(mode))throw new Error('Use smoke, full or analyze');
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{mode},env:{NODE_ENV:'test',EXTERNAL_INFERENCE_ENABLED:'false'},execArgv:[]});
worker.on('message',m=>console.log(typeof m==='string'?m:JSON.stringify(m,null,2)));
worker.on('error',e=>{console.error(e.message);process.exitCode=1;});
worker.on('exit',code=>{if(code)process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{worker.postMessage({stop:true});});
