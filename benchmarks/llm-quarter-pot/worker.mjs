import './isolation.mjs';
import '../bot-audit/runtime.mjs';
import { parentPort,workerData } from 'node:worker_threads';
import { readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync,renameSync,fsyncSync,writeSync } from 'node:fs';
import { gzipSync,gunzipSync } from 'node:zlib';
const {hash,digest,extract}=await import('./ledger.ts');
const {configuration}=await import('./assumptions.ts');
const {enumerate,score,verifyScored}=await import('./evaluator.ts');
const {analyze,report}=await import('./analysis.ts');
const {key}=await import('./replay.ts');
const dir='benchmarks/llm-quarter-pot/',output='benchmarks/results/llm-quarter-pot-v1/';
const manifestBytes=readFileSync(dir+'manifest-v1.json'),manifest=JSON.parse(manifestBytes),manifestHash=hash(manifestBytes);
function verify(){
 if(digest(manifest.configuration)!==digest(configuration)||manifest.version!==configuration.version||manifest.scored!==false)throw new Error('Frozen configuration mismatch');
 for(const [p,h] of Object.entries(manifest.files))if(hash(readFileSync(p))!==h)throw new Error('Incompatible frozen source/evidence: '+p);
 if(hash(readFileSync(dir+'manifest-v1.json'))!==manifestHash)throw new Error('Manifest changed');
}
verify();
const frozen=JSON.parse(gunzipSync(readFileSync(dir+'assumptions-v1.json.gz')));
const observations=extract(JSON.parse(gunzipSync(readFileSync('benchmarks/bet-sizing/live-evidence-2026-10-16.json.gz'))),JSON.parse(readFileSync('benchmarks/bet-sizing/plan.json')),JSON.parse(readFileSync('benchmarks/bet-sizing/freeze.json')));
if(digest(observations)!==digest(JSON.parse(readFileSync(dir+'observations-v1.json')))||frozen.length!==2||digest(frozen.map(f=>({spec:f.spec,candidates:f.candidates})))!==digest(manifest.fixtures))throw new Error('Extraction/fixture mismatch');
mkdirSync(output,{recursive:true});
const lock=output+'run.lock';
let descriptor;
try{descriptor=openSync(lock,'wx');writeFileSync(descriptor,JSON.stringify({pid:process.pid,mode:workerData.mode,manifestHash})+'\n');}catch{throw new Error('Another run or stale run.lock; do not run concurrently. See README recovery.');}
let stopping=false;parentPort.on('message',()=>{stopping=true;});
const emit=value=>parentPort.postMessage(value);
function immutable(path,bytes){
 if(existsSync(path)){if(hash(readFileSync(path))!==hash(bytes))throw new Error('Refusing overwritten/incompatible evidence: '+path);return;}
 const temp=path+'.tmp';
 const fd=openSync(temp,'wx',0o600);try{writeSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 if(existsSync(path))throw new Error('Evidence appeared concurrently');renameSync(temp,path);
 const parent=openSync(output,'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}
function load(path){const a=JSON.parse(gunzipSync(readFileSync(path)));if(a.manifestHash!==manifestHash)throw new Error('Incompatible resume: '+path);return a;}
const started=performance.now();
try{
 if(workerData.mode==='smoke'){
   // Smoke deliberately samples mechanics only; never computes the full 27-cell screen.
   const fixture=frozen[0],small={...fixture,holdings:fixture.holdings.slice(0,2)};
   small.tables=fixture.tables.map(t=>({...t,rows:t.rows.slice(0,2)}));
   const raw=enumerate(small,{type:'check'}),cells=score(small,raw);
   if(raw.outcomes.length!==2||cells.length!==27||!cells.some(c=>c.branches.some(b=>b.continuation==='call'))||raw.terminals<2)throw new Error('Smoke mechanics failed');
   emit({mode:'smoke',passed:true,observations:observations.length,holdingsInFull:frozen.map(f=>f.holdings.length),mechanicalHoldings:2,cells:cells.length,manifestHash,seconds:(performance.now()-started)/1000,next:'npm run benchmark:llm-quarter-pot -- full'});
 }else{
   const jobs=frozen.flatMap(f=>f.candidates.map(action=>({f,action,path:output+f.spec.id+'-'+key(action).replace(':','-')+'.json.gz'})));
   const rows=[],checkpointHashes={};
   for(const [i,{f,action,path}] of jobs.entries()){
     if(stopping)throw new Error('Stopped after completed checkpoint; resume full with unchanged sources');
     let saved;
     if(existsSync(path))saved=load(path);
     else{
       if(workerData.mode==='analyze')throw new Error('Incomplete evidence; defer. Missing '+path);
       const raw=enumerate(f,action),cells=score(f,raw);verify();
       saved={manifestHash,raw,cells};immutable(path,gzipSync(JSON.stringify(saved)));
     }
     if(saved.raw.fixture!==f.spec.id||key(saved.raw.root)!==key(action))throw new Error('Checkpoint identity mismatch');
     verifyScored(f,saved.raw,saved.cells);rows.push(...saved.cells);checkpointHashes[path]=hash(readFileSync(path));
     if(workerData.mode==='full')emit(`Saved/verified ${i+1}/${jobs.length}: ${f.spec.id} ${key(action)}. Exact engine terminals: ${saved.raw.terminals}.`);
     await new Promise(resolve=>setImmediate(resolve));
   }
   verify();
   const completion={manifestHash,checkpointHashes,actions:jobs.length,cells:rows.length,observations:observations.length};
   const completionPath=output+'completion-v1.json';
   if(workerData.mode==='analyze'&&!existsSync(completionPath))throw new Error('Missing full completion evidence; defer');
   immutable(completionPath,Buffer.from(JSON.stringify(completion,null,2)+'\n'));
   const result={...completion,...analyze(rows,observations)};
   immutable(output+'analysis-v1.json',Buffer.from(JSON.stringify(result,null,2)+'\n'));
   immutable(output+'report-v1.md',Buffer.from(report(result)));
   emit({mode:workerData.mode,verdict:result.verdict,fixtures:result.fixtures.map(f=>({fixture:f.fixture,passed:f.passed,worstSizeBB:f.worstSizeBB,worstMenuBB:f.worstMenuBB})),seconds:(performance.now()-started)/1000,artifacts:{manifest:dir+'manifest-v1.json',observations:dir+'observations-v1.json',assumptions:dir+'assumptions-v1.json.gz',completion:completionPath,analysis:output+'analysis-v1.json',report:output+'report-v1.md'},next:workerData.mode==='full'?'npm run benchmark:llm-quarter-pot -- analyze':'Return saved artifacts for review. No evaluation rerun needed.'});
 }
}catch(error){emit({verdict:'defer',status:'incomplete-or-invalid',reason:error instanceof Error?error.message:'Offline evaluation failed',output});throw error;}
finally{closeSync(descriptor);unlinkSync(lock);parentPort.close();}
