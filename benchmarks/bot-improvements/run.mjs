import '../bot-audit/runtime.mjs';
import { existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { loadEnvFile } from 'node:process';
const directory='benchmarks/bot-improvements/';
const mode=process.argv[2];
if(mode==='live' && existsSync('.env.test')) loadEnvFile('.env.test');
if(mode!=='live') { process.env.EXTERNAL_INFERENCE_ENABLED='false'; globalThis.fetch=()=>{throw new Error('Offline network forbidden');}; }
const { prepare,observe,liveBot,analyze,version } = await import('./experiment.ts');
const { digest,verifyFreeze,atomicWrite } = await import('../bot-audit/safety.ts');
const { Ledger,preflight } = await import('./ledger.ts');
function walk(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(`${dir}/${f.name}`):/\.(ts|mjs|js)$/.test(f.name)?[`${dir}/${f.name}`]:[]); }
function sourceFiles() {
  return Object.fromEntries([...walk('lib'),...walk('benchmarks').filter(p=>!p.startsWith('benchmarks/results/')),
    ...walk('node_modules/@hivetech/poker-engine'), 'package.json','package-lock.json'].sort().map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
}
if(mode==='prepare') {
  const p=prepare(),files=sourceFiles();
  const manifest={version,configuration:{jev:'jev-latest',llm:'openai/gpt-5.4-mini',reasoning:'low',playstyle:'balanced'},cap:600,plan:p.plan,files};
  for(const [name,value] of [['plan.json',manifest],['freeze.json',{files,planHash:digest(manifest)}]]) writeFileSync(directory+name,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  console.log('Frozen 600 slots, no inference');
} else if(mode==='live') {
  preflight();
  const manifest=JSON.parse(readFileSync(directory+'plan.json')), freeze=JSON.parse(readFileSync(directory+'freeze.json'));
  verifyFreeze(freeze.files);
  if(digest(manifest)!==freeze.planHash || digest(manifest.files)!==digest(freeze.files)) throw new Error('Manifest changed');
  const p=prepare(); if(digest(p.plan)!==digest(manifest.plan)) throw new Error('Input plan changed');
  const ledger=new Ledger(directory+'live-ledger.json',manifest);
  for(const entry of p.plan) {
    const slot=ledger.reserve(entry);
    const row=await observe(liveBot(entry.provider,()=>ledger.request(slot)),entry,p);
    ledger.complete(slot,row);
    atomicWrite(directory+'live-summary.json',analyze(ledger.slots.map(s=>s.row)));
    if(ledger.slots.length%20===0) console.log(`Completed ${ledger.slots.length}/600`);
  }
  writeFileSync(directory+'live-evidence.json.gz',gzipSync(readFileSync(directory+'live-ledger.json')),{flag:'wx'});
  console.log('Completed exactly 600 requests; allocation exhausted');
} else if(mode==='offline') {
  const {traces,invariants,seedSweep}=await import('./offline.ts');
  const fixed={version,source:sourceFiles(),traces:await traces(),invariants:await invariants(),seedSweep:await seedSweep()};
  if(fixed.invariants.some(r=>!r.canonicalMatches)) throw new Error('Candidate invariants failed');
  mkdirSync('benchmarks/results',{recursive:true});
  atomicWrite('benchmarks/results/bot-improvements-offline.json',{...fixed,matches:[]});
  const groups=[];
  for(const opponent of ['frozen','passive','aggressive']) for(const difficulty of ['easy','medium','hard']) for(const seats of [2,6]) groups.push([opponent,difficulty,seats,500,100]);
  const matches=[];
  for(let i=0;i<groups.length;i+=3) {
    const batch=await Promise.all(groups.slice(i,i+3).map(group=>new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:group,env:{EXTERNAL_INFERENCE_ENABLED:'false',NODE_ENV:'test'}});
      worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0) reject(new Error('Worker failed'));});
    })));
    matches.push(...batch); atomicWrite('benchmarks/results/bot-improvements-offline.json',{...fixed,matches});
    console.log(`Completed ${matches.length}/18 match groups`);
  }
  writeFileSync(directory+'offline-evidence.json.gz',gzipSync(JSON.stringify({...fixed,matches})),{flag:'wx'});
} else if(mode==='analyze') {
  const path=process.argv[3]??directory+'live-evidence.json.gz';
  const evidence=JSON.parse(gunzipSync(readFileSync(path)).toString());
  const result=analyze(evidence.slots.map(s=>s.row).filter(Boolean));
  const output=process.argv[4]??'benchmarks/results/bot-improvements-analysis.json';
  mkdirSync('benchmarks/results',{recursive:true});atomicWrite(output,result);
  console.log(JSON.stringify(result.reliability));
} else throw new Error('Use prepare, offline, live or analyze');
