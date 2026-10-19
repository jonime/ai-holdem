import '../bot-audit/runtime.mjs';
import { parentPort } from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import dgram from 'node:dgram';
const forbidden = () => { throw new Error('Offline network forbidden'); };
globalThis.fetch = forbidden;
net.connect = net.createConnection = net.Socket.prototype.connect = forbidden;
http.request = http.get = https.request = https.get = tls.connect = dgram.createSocket = forbidden;
syncBuiltinESMExports();
if(Object.keys(process.env).some(k=>/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))) throw new Error('Credential in offline worker');
const { evaluate } = await import('./experiment.ts');
const { mechanical } = await import('./mechanical.ts');
parentPort.on('message',async job=>{
  try { parentPort.postMessage({result:job.kind==='mechanical'?await mechanical(job.fixtures):await evaluate(job.fixture,job.difficulty,job.draws??16)}); }
  catch(error) { parentPort.postMessage({error:error instanceof Error?error.message:'Worker failed'}); }
});
parentPort.postMessage({ready:true});
