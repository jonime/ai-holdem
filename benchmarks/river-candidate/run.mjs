import '../bot-audit/runtime.mjs';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
const {configuration,version,difficulties}=await import('./config.ts');
const {makeFixtures}=await import('./fixtures.ts');
const {analyze}=await import('./analysis.ts');
const {hash,verify}=await import('../preflop-action-value/integrity.ts');
const {acquire,parse,save}=await import('./storage.ts');
const mode=process.argv[2]??'smoke';
if(process.argv.length>3||!['freeze','smoke','development','confirmation','analyze'].includes(mode))throw new Error('Use smoke, development, confirmation or analyze');
const dir='benchmarks/river-candidate/',local='benchmarks/results/river-candidate-v1/';
function walk(d){return readdirSync(d,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(`${d}/${f.name}`):/\.(ts|mjs|js)$/.test(f.name)?[`${d}/${f.name}`]:[]);}
function sources(){return Object.fromEntries([...walk('lib'),...walk('benchmarks').filter(p=>!p.startsWith('benchmarks/results/')),...walk('node_modules/@hivetech/poker-engine'),'package.json','package-lock.json'].sort().map(p=>[p,hash(readFileSync(p))]));}
function read(name){return JSON.parse(gunzipSync(readFileSync(dir+name)));}
function archive(name,data){const bytes=gzipSync(JSON.stringify(data));if(existsSync(dir+name)){if(hash(readFileSync(dir+name))!==hash(bytes))throw new Error(`Immutable archive differs: ${name}`);return;}writeFileSync(dir+name,bytes,{flag:'wx'});}
const started=performance.now(), fixtures=makeFixtures(),freezePath=dir+'freeze-v1.json';
if(mode==='freeze'){
  if(existsSync(freezePath))throw new Error('Freeze exists; changed sources require a new version');
  const files=sources();
  archive('baseline-source-v1.json.gz',{version,files:Object.fromEntries(Object.keys(files).map(p=>[p,readFileSync(p,'utf8')]))});
  writeFileSync(freezePath,JSON.stringify({version,configuration,files,fixtures,baselineHash:hash(readFileSync(dir+'baseline-source-v1.json.gz'))},null,2)+'\n',{flag:'wx'});
  console.log('Frozen sources, rules, allocations, synthetic assumptions and recoverable baseline. No study decisions collected.');process.exit(0);
}
const manifest=JSON.parse(readFileSync(freezePath));
function verifyAll(){
  verify(manifest.files);
  if(manifest.version!==version||JSON.stringify(manifest.configuration)!==JSON.stringify(configuration)||JSON.stringify(manifest.fixtures)!==JSON.stringify(fixtures)||JSON.stringify(manifest.files)!==JSON.stringify(sources())||hash(readFileSync(dir+'baseline-source-v1.json.gz'))!==manifest.baselineHash)throw new Error('Frozen source set/configuration/allocation/baseline changed; use a new version');
}
verifyAll();const manifestHash=hash(readFileSync(freezePath));
const active=new Set();let stopped=false;
function stop(){stopped=true;for(const w of active)void w.terminate();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
async function connection(){
  const worker=new Worker(new URL('./worker.mjs',import.meta.url),{env:{NODE_ENV:'test',EXTERNAL_INFERENCE_ENABLED:'false'},execArgv:[]});active.add(worker);
  function next(){return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
    const message=m=>{cleanup();if(m.error)reject(new Error(m.error));else resolve(m);};
    const error=e=>{cleanup();reject(e);};const exit=()=>{cleanup();reject(new Error('Worker exited before checkpoint'));};
    worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
  });}
  await next();
  return {async run(job){if(stopped)throw new Error('Stopped');const reply=next();worker.postMessage(job);return(await reply).result;},async close(){active.delete(worker);await worker.terminate();}};
}
mkdirSync(local,{recursive:true});
const release=acquire(local+'coordinator.lock');
try{
  async function mechanics(){
    if(existsSync(dir+'mechanical-v1.json.gz')){const a=read('mechanical-v1.json.gz');if(a.manifestHash!==manifestHash||!a.result.passed||a.result.samples!==5000)throw new Error('Mechanical prerequisite failed');return a.result;}
    const w=await connection();try{const result=await w.run({kind:'mechanical',fixtures});verifyAll();archive('mechanical-v1.json.gz',{manifestHash,result});return result;}finally{await w.close();}
  }
  function readPhase(phase,selected=difficulties){
    const a=read(phase+'-v1.json.gz');
    const specs=fixtures.filter(f=>f.spec.phase===phase).flatMap(f=>selected.map(difficulty=>({f,difficulty})));
    if(a.manifestHash!==manifestHash||a.mechanicalHash!==hash(readFileSync(dir+'mechanical-v1.json.gz'))||JSON.stringify(a.selected)!==JSON.stringify(selected)||a.rows.length!==specs.length)throw new Error('Phase provenance/completeness mismatch');
    if(phase==='confirmation'&&a.developmentHash!==hash(readFileSync(dir+'development-v1.json.gz')))throw new Error('Confirmation development mismatch');
    return a.rows.map((row,i)=>{
      const {f,difficulty}=specs[i], path=local+`${f.spec.id.replaceAll('/','_')}_${difficulty}.json.gz`;
      const saved=parse(readFileSync(path),manifestHash,f,difficulty);
      if(JSON.stringify(saved)!==JSON.stringify(row))throw new Error('Archive/checkpoint mismatch');return saved;
    });
  }
  async function phaseStage(phase,selected){
    if(existsSync(dir+phase+'-v1.json.gz'))return readPhase(phase,selected);
    const jobs=fixtures.filter(f=>f.spec.phase===phase).flatMap(f=>selected.map(difficulty=>({f,difficulty}))),rows=new Map();let index=0,completed=0;
    async function loop(){const w=await connection();try{while(index<jobs.length){
      const {f,difficulty}=jobs[index++],id=`${f.spec.id.replaceAll('/','_')}_${difficulty}`,path=local+id+'.json.gz';let row;
      if(existsSync(path))row=parse(readFileSync(path),manifestHash,f,difficulty);
      else{
        try{row=await w.run({fixture:f,difficulty});}
        catch(error){if(stopped)throw error;row={fixture:f,difficulty,samples:5000,active:false,root:null,candidate:null,pairs:[],failure:'worker_failed'};save(path,manifestHash,row);throw error;}
        verify(manifest.files);save(path,manifestHash,row);
      }
      rows.set(id,row);completed++;if(completed%6===0||completed===jobs.length)console.log(`${phase}: ${completed}/${jobs.length} situation/difficulty blocks checkpointed; failures ${[...rows.values()].filter(r=>r.failure).length}`);
    }}finally{await w.close();}}
    const tasks=Array.from({length:Math.min(2,jobs.length)},loop);
    try{await Promise.all(tasks);}catch(error){stop();await Promise.allSettled(tasks);throw error;}
    verifyAll();const ordered=jobs.map(({f,difficulty})=>rows.get(`${f.spec.id.replaceAll('/','_')}_${difficulty}`));
    archive(phase+'-v1.json.gz',{manifestHash,mechanicalHash:hash(readFileSync(dir+'mechanical-v1.json.gz')),developmentHash:phase==='confirmation'?hash(readFileSync(dir+'development-v1.json.gz')):null,selected,rows:ordered});return ordered;
  }
  let summary,next;
  if(mode==='smoke'){
    const w=await connection();try{
      const result=await w.run({kind:'mechanical',fixtures});
      const row=await w.run({fixture:fixtures.find(f=>f.spec.replicate===1),difficulty:'medium',draws:1});
      if(row.failure||row.pairs.length!==9)throw new Error('Smoke failed: '+row.failure);
      summary={mechanical:result,active:row.active,pairedRollouts:row.pairs.length,sourceVerified:true};next='npm run benchmark:river-candidate -- development';
    }finally{await w.close();}
  }else{
    const mechanical=mode==='analyze'?read('mechanical-v1.json.gz'):null;
    if(mode==='analyze'&&(mechanical.manifestHash!==manifestHash||!mechanical.result.passed))throw new Error('Mechanical provenance mismatch');
    if(mode!=='analyze')await mechanics();
    if(mode==='development'){
      const rows=await phaseStage('development',difficulties),report=analyze(rows,'development',true);
      summary={gates:report.map(r=>({difficulty:r.difficulty,activation:r.activation,failures:r.failures,passed:r.passed})),qualifying:report.filter(r=>r.passed).map(r=>r.difficulty)};
      writeFileSync(local+'development-analysis.json',JSON.stringify(report,null,2)+'\n');next='npm run benchmark:river-candidate -- confirmation';
    }else{
      const development=readPhase('development'),dev=analyze(development,'development',true),selected=dev.filter(r=>r.passed).map(r=>r.difficulty);
      if(mode==='confirmation'){
        const rows=await phaseStage('confirmation',selected),report=analyze(rows,'confirmation',true);
        summary={qualifying:selected,gates:report.map(r=>({difficulty:r.difficulty,activation:r.activation,failures:r.failures,verdict:r.verdict})),plannedSituationsPerQualifyingDifficulty:120};next='npm run benchmark:river-candidate -- analyze';
      }else{
        const confirmation=readPhase('confirmation',selected),confirm=analyze(confirmation,'confirmation',true);
        const report={manifestHash,developmentHash:hash(readFileSync(dir+'development-v1.json.gz')),confirmationHash:hash(readFileSync(dir+'confirmation-v1.json.gz')),configuration,development:dev,confirmation:confirm,verdict:Object.fromEntries(confirm.map(r=>[r.difficulty,selected.includes(r.difficulty)&&r.passed?r.verdict:'defer']))};
        archive('analysis-v1.json.gz',report);writeFileSync(local+'analysis.json',JSON.stringify(report,null,2)+'\n');
        const markdown=`# River candidate v1\n\nManifest: ${manifestHash}\n\n${JSON.stringify(report.verdict)}\n\nFull activation, uncertainty, individual losses, response frequencies, failure exclusions and stratum results: [analysis JSON](../results/river-candidate-v1/analysis.json). Frozen construction exclusions and allocations: [manifest](freeze-v1.json).\n\nConditional synthetic-policy values only; bootstrap coverage is approximate. Confirmation confidence ${configuration.bootstrap.confirmationConfidence} across all 27 planned comparisons. No GTO or whole-game claim. Production unchanged pending saved-evidence review.\n`;
        if(existsSync(dir+'report-v1.md')){if(readFileSync(dir+'report-v1.md','utf8')!==markdown)throw new Error('Immutable report changed');}else writeFileSync(dir+'report-v1.md',markdown,{flag:'wx'});
        summary={verdict:report.verdict,artifact:local+'analysis.json',manifestHash};next='Return this summary or benchmarks/river-candidate/analysis-v1.json.gz for saved-evidence review; no simulation rerun needed.';
      }
    }
  }
  verifyAll();console.log(JSON.stringify({stage:mode,...summary,elapsedSeconds:Math.round((performance.now()-started)/1000),next},null,2));
}finally{stop();release();}
