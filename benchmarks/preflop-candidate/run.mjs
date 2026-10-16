import '../bot-audit/runtime.mjs';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
globalThis.fetch=()=>{throw new Error('Offline network forbidden');};
const {allocation,version}=await import('./fixtures.ts');
const {analyze,select,verdict}=await import('./analysis.ts');
const {hash,verify}=await import('../preflop-action-value/integrity.ts');
const {acquire,parseCheckpoint,saveCheckpoint}=await import('./storage.ts');
const dir='benchmarks/preflop-candidate/',local='benchmarks/results/preflop-candidate-v1/';
const configuration={handNumbers:[1,2,7,16],combinations:6,developmentReplicates:4,holdoutReplicates:10,developmentConfidence:.95,confirmationConfidence:1-.05/6,bootstrapResamples:20000,selection:'positive lower bounds for all controls; maximize worst lower bound; call wins ties',controls:['frozen','passive','aggressive'],heroContinuation:'unchanged production Rules',scriptedEquitySamples:1,overrides:'baseline folds only; six-seat UTG; equal100BB; complete empty history',rake:0};
const mode=process.argv[2]??'run';
if(process.argv.length>3)throw new Error('Additional arguments are not supported');
if(mode==='run'&&existsSync(dir+'analysis-v1.json.gz'))throw new Error('Completed study exists; use analyze or a new version');
if(!['run','fixed','screen','confirm','analyze','smoke'].includes(mode))throw new Error('Use run, fixed, screen, confirm, analyze or smoke');
function walk(d){return readdirSync(d,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(`${d}/${f.name}`):/\.(ts|mjs|js)$/.test(f.name)?[`${d}/${f.name}`]:[]);}
function sources(){return Object.fromEntries([...walk('lib'),...walk('benchmarks').filter(p=>!p.startsWith('benchmarks/results/')),...walk('node_modules/@hivetech/poker-engine'),'package.json','package-lock.json'].sort().map(p=>[p,hash(readFileSync(p))]));}
function read(name){return JSON.parse(gunzipSync(readFileSync(dir+name)));}
function archive(name,data){if(existsSync(dir+name)){if(hash(JSON.stringify(read(name)))!==hash(JSON.stringify(data)))throw new Error(`Completed archive differs: ${name}`);return;}writeFileSync(dir+name,gzipSync(JSON.stringify(data)),{flag:'wx'});}
const active=new Set();let stopped=false;
function stop(){stopped=true;for(const w of active)void w.terminate();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
async function connection(smoke=false){
  const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{smoke},env:{NODE_ENV:'test',EXTERNAL_INFERENCE_ENABLED:'false'},execArgv:[]});active.add(worker);
  async function next(){return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
    const message=m=>{cleanup();if(m.error)reject(new Error(m.error));else resolve(m);};
    const error=e=>{cleanup();reject(e);};const exit=()=>{cleanup();reject(new Error('Worker exited before checkpoint'));};
    worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
  });}
  const ready=await next();if(!ready.ready)throw new Error('Worker not ready');
  return {async run(job){if(stopped)throw new Error('Stopped');const reply=next();worker.postMessage(job);return(await reply).result;},async close(){active.delete(worker);await worker.terminate();}};
}
if(mode==='smoke'){
  const w=await connection(true);try{const row=await w.run({spec:allocation('screen')[0],selection:{}});if(row.failure)throw new Error('Smoke failed');console.log(JSON.stringify({samples:row.samples,completed:true,uniqueRollouts:row.uniqueRollouts}));}finally{await w.close();}
}else{
  mkdirSync(local,{recursive:true});
  const release=mode==='analyze'?()=>{}:acquire(local+'coordinator.lock');
  try{
    let manifest;
    const freezePath=dir+'freeze-v1.json';
    if(existsSync(freezePath))manifest=JSON.parse(readFileSync(freezePath));
    else{
      if(mode==='analyze'||mode==='confirm')throw new Error('Source freeze missing');
      manifest={version,samples:5000,workers:4,screen:allocation('screen'),confirmation:allocation('confirm'),files:sources(),configuration};
      writeFileSync(freezePath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    }
    verify(manifest.files);
    if(JSON.stringify(manifest.configuration)!==JSON.stringify(configuration)||manifest.workers!==4||hash(JSON.stringify(manifest.files))!==hash(JSON.stringify(sources())))throw new Error('Frozen source set/configuration changed');
    if(manifest.version!==version||manifest.samples!==5000||JSON.stringify(manifest.screen)!==JSON.stringify(allocation('screen'))||JSON.stringify(manifest.confirmation)!==JSON.stringify(allocation('confirm')))throw new Error('Frozen allocation changed');
    const manifestHash=hash(JSON.stringify(manifest));
    async function fixedStage(){
      if(existsSync(dir+'fixed-v1.json.gz')){const f=read('fixed-v1.json.gz');if(f.manifestHash!==manifestHash||f.result.samples!==5000||f.result.passed!==true)throw new Error('Fixed archive mismatch');return f.result;}
      const w=await connection();try{const result=await w.run({kind:'fixed'});verify(manifest.files);archive('fixed-v1.json.gz',{manifestHash,result});console.log(`Fixed checks passed: ${result.rows.length} decisions`);return result;}finally{await w.close();}
    }
    function fixedRead(){const f=read('fixed-v1.json.gz');if(f.manifestHash!==manifestHash||!f.result.passed||f.result.samples!==5000)throw new Error('Fixed checks required');return f.result;}
    async function phaseStage(phase,selection={}){
      fixedRead();if(existsSync(dir+phase+'-v1.json.gz'))return readPhase(phase,selection);const specs=(phase==='screen'?manifest.screen:manifest.confirmation.filter(s=>selection[s.target]));
      let index=0,complete=0;const rows=new Map();
      async function loop(){const w=await connection();try{while(index<specs.length){if(stopped)throw new Error('Stopped');const spec=specs[index++],path=local+spec.id+'.json.gz';let row;
        if(existsSync(path))row=parseCheckpoint(readFileSync(path),manifestHash,spec,selection);
        else{row=await w.run({spec,selection});saveCheckpoint(path,manifestHash,row,selection);}
        rows.set(spec.id,row);complete++;if(complete%12===0||complete===specs.length)console.log(`${phase}: ${complete}/${specs.length} paired blocks saved`);
      }}finally{await w.close();}}
      const tasks=Array.from({length:Math.min(4,specs.length)},loop);
      try{await Promise.all(tasks);}catch(error){stop();await Promise.allSettled(tasks);throw error;}
      verify(manifest.files);
      const result={manifestHash,fixedHash:hash(readFileSync(dir+'fixed-v1.json.gz')),selectionHash:phase==='confirm'?hash(readFileSync(dir+'selection-v1.json')):null,selection,rows:specs.map(s=>rows.get(s.id))};archive(phase+'-v1.json.gz',result);return result.rows;
    }
    function readPhase(phase,selection={}){const a=read(phase+'-v1.json.gz');if(a.manifestHash!==manifestHash||a.fixedHash!==hash(readFileSync(dir+'fixed-v1.json.gz'))||a.selectionHash!==(phase==='confirm'?hash(readFileSync(dir+'selection-v1.json')):null)||JSON.stringify(a.selection)!==JSON.stringify(selection))throw new Error('Phase archive mismatch');const specs=phase==='screen'?manifest.screen:manifest.confirmation.filter(s=>selection[s.target]);if(a.rows.length!==specs.length)throw new Error('Incomplete archive');return a.rows.map((row,i)=>parseCheckpoint(gzipSync(JSON.stringify({manifestHash,row})),manifestHash,specs[i],selection));}
    function selectionRead(){const s=JSON.parse(readFileSync(dir+'selection-v1.json'));if(s.manifestHash!==manifestHash||s.screenHash!==hash(readFileSync(dir+'screen-v1.json.gz')))throw new Error('Selection is not bound to screen');const expected=select(readPhase('screen'),fixedRead().passed);if(JSON.stringify(s.selected)!==JSON.stringify(expected))throw new Error('Selection changed');return s.selected;}
    if(mode==='fixed'||mode==='run')await fixedStage();
    if(mode==='screen'||mode==='run'){
      const rows=await phaseStage('screen');const selected=select(rows,fixedRead().passed);
      const s={manifestHash,screenHash:hash(readFileSync(dir+'screen-v1.json.gz')),selected,rule:manifest.configuration.selection};
      if(existsSync(dir+'selection-v1.json')){if(hash(readFileSync(dir+'selection-v1.json'))!==hash(JSON.stringify(s,null,2)+'\n'))throw new Error('Selection file differs');}
      else writeFileSync(dir+'selection-v1.json',JSON.stringify(s,null,2)+'\n',{flag:'wx'});
      console.log('Development selection: '+JSON.stringify(selected));
    }
    if(mode==='confirm'||mode==='run')await phaseStage('confirm',selectionRead());
    if(mode==='analyze'||mode==='run'){
      const selected=selectionRead(),screen=readPhase('screen'),confirmation=readPhase('confirm',selected);
      const analysis={manifestHash,selected,screen:analyze(screen,'screen'),confirmation:analyze(confirmation,'confirm',selected),verdict:verdict(confirmation,selected,fixedRead().passed),counts:{screenBlocks:screen.length,confirmationBlocks:confirmation.length,excluded:[...screen,...confirmation].filter(r=>r.failure).length,uniqueRollouts:[...screen,...confirmation].reduce((s,r)=>s+r.uniqueRollouts,0)}};
      verify(manifest.files);archive('analysis-v1.json.gz',analysis);writeFileSync(local+'analysis.json',JSON.stringify(analysis,null,2)+'\n');console.log(JSON.stringify({selected,verdict:analysis.verdict,counts:analysis.counts}));
    }
  }finally{stop();release();}
}
