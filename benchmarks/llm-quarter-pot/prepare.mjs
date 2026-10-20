// Maintainer-only freeze construction. Never scores action values or imports providers.
import { Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import '../bot-audit/runtime.mjs';
const {extract,digest,hash}=await import('./ledger.ts');
const {expand,configuration}=await import('./assumptions.ts');
const {replay,key}=await import('./replay.ts');
const {pokerEngineAdapter:engine}=await import('../../lib/poker/adapter.ts');
const dir='benchmarks/llm-quarter-pot/';
if(existsSync(dir+'manifest-v1.json'))throw new Error('Immutable freeze exists; use a new version');
function save(p,data){const bytes=Buffer.from(JSON.stringify(data)+'\n');if(existsSync(p)){if(hash(readFileSync(p))!==hash(bytes))throw new Error('Existing freeze differs: '+p);}else writeFileSync(p,bytes,{flag:'wx'});}
const files=['benchmarks/bet-sizing/plan.json','benchmarks/bet-sizing/freeze.json','benchmarks/bet-sizing/live-evidence-2026-10-16.json.gz',dir+'historical-sources-v1.json.gz'];
const plan=JSON.parse(readFileSync(files[0])),freeze=JSON.parse(readFileSync(files[1]));
const observations=extract(JSON.parse(gunzipSync(readFileSync(files[2]))),plan,freeze);
const historical=await new Promise((resolve,reject)=>{
 const w=new Worker(new URL('./historical-worker.mjs',import.meta.url),{env:{NODE_ENV:'test',EXTERNAL_INFERENCE_ENABLED:'false'},execArgv:[]});
 w.once('message',data=>{resolve(data);void w.terminate();});w.once('error',reject);w.once('exit',code=>{if(code)reject(new Error('Historical reconstruction exited'));});
});
const specs=historical.map(f=>{
 const frozen=plan.fixtures.find(p=>p.id===f.id);
 if(digest(f.context)!==frozen.hash)throw new Error('Original base context hash mismatch');
 const candidates=[...new Map(Object.values(f.variants).flatMap(v=>v.candidates).map(a=>[key(a),a])).values()];
 for(const [menu,v] of Object.entries(f.variants)){
  if(v.hash!==frozen.variants[menu]||digest(v.context)!==v.hash)throw new Error('Original provider input hash mismatch');
  for(const r of observations.filter(r=>r.fixture===f.id&&r.menu===menu))if(r.inputHash!==v.hash||!v.candidates.some(a=>digest(a)===digest(r.action)))throw new Error('Recorded action unavailable');
 }
 const spec={version:'first-to-act-river-v1',id:f.id,hero:f.heroCards,board:f.view.communityCards,stacks:f.state.config.players.map(p=>p.stack),smallBlind:f.state.config.smallBlind,bigBlind:f.state.config.bigBlind,buttonSeat:f.view.buttonSeat,heroSeat:f.view.currentActorSeat,history:f.transcript};
 const opponent=engine.heroCards(f.state,'p0'),state=replay(spec,opponent),view=engine.decisionView(state);
 const project=v=>({street:v.street,buttonSeat:v.buttonSeat,currentActorSeat:v.currentActorSeat,currentBet:v.currentBet,pot:v.pot,board:v.communityCards,order:v.postflopOrder,players:v.players.map(p=>({id:p.id,seat:p.seat,stack:p.stack,committedStreet:p.committedStreet,committedHand:p.committedHand,folded:p.folded,allIn:p.allIn}))});
 if(digest(project(view))!==digest(project(f.view)))throw new Error('Historical/current replay mismatch');
 for(const a of candidates)engine.applyAction(state,'p1',a);
 return {spec,candidates};
});
save(dir+'observations-v1.json',observations);
const historicalBytes=gzipSync(JSON.stringify(historical));
if(existsSync(dir+'reconstruction-v1.json.gz')){if(hash(readFileSync(dir+'reconstruction-v1.json.gz'))!==hash(historicalBytes))throw new Error('Reconstruction exists and differs');}else writeFileSync(dir+'reconstruction-v1.json.gz',historicalBytes,{flag:'wx'});
console.log('Original ledger, all forty observations, provider hashes and first-to-act replay validated. Expanding assumptions without scoring.');
const expanded=specs.map(({spec,candidates})=>expand(spec,candidates)),expandedBytes=gzipSync(JSON.stringify(expanded));
if(existsSync(dir+'assumptions-v1.json.gz')){if(hash(readFileSync(dir+'assumptions-v1.json.gz'))!==hash(expandedBytes))throw new Error('Assumptions exist and differ');}else writeFileSync(dir+'assumptions-v1.json.gz',expandedBytes,{flag:'wx'});
files.push(dir+'observations-v1.json',dir+'reconstruction-v1.json.gz',dir+'assumptions-v1.json.gz');
function walk(p){return readdirSync(p,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(`${p}/${f.name}`):/\.(ts|mjs|js)$/.test(f.name)?[`${p}/${f.name}`]:[]);}
const sources=[...walk('lib'),...walk(dir.slice(0,-1)),...walk('benchmarks/range-equity'),...walk('node_modules/@hivetech/poker-engine'),'benchmarks/bot-audit/runtime.mjs','package.json','package-lock.json'];
save(dir+'manifest-v1.json',{version:configuration.version,configuration,originalPlanHash:freeze.planHash,originalSources:freeze.files,fixtures:specs,observations:40,holdingsPerFixture:990,cellsPerFixture:27,scored:false,files:Object.fromEntries([...new Set([...files,...sources])].sort().map(p=>[p,hash(readFileSync(p))]))});
console.log('Frozen manifest, observations, historical reconstruction, complete range/response tables. No action EV scored.');
