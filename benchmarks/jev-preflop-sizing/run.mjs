import './isolation.mjs';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
for(const key of Object.keys(process.env))delete process.env[key];
process.env.NODE_ENV='test';process.env.EXTERNAL_INFERENCE_ENABLED='false';
const {allocation,configuration,version,hands}=await import('./config.ts');
const {responseTables}=await import('./policies.ts');
const {verifyEvidence,evidencePaths}=await import('./evidence.ts');
const {hash,verify}=await import('../preflop-action-value/integrity.ts');
const {acquire,parse,save}=await import('./storage.ts');
const {select,analyze}=await import('./analysis.ts');
const mode=process.argv[2]??'smoke';
if(process.argv.length>3||!['smoke','development','confirmation','analyze'].includes(mode))throw new Error('Use smoke, development, confirmation or analyze');
const dir='benchmarks/jev-preflop-sizing/',local='benchmarks/results/'+version+'/';
mkdirSync(local,{recursive:true});
const release=acquire(local+'coordinator.lock');
let worker,stopped=false;
process.once('SIGINT',()=>{stopped=true;void worker?.terminate();process.exitCode=130;});
process.once('SIGTERM',()=>{stopped=true;void worker?.terminate();process.exitCode=143;});
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):/\.(ts|tsx|mts|cts|mjs|cjs|js|jsx|json)$/.test(e.name)?[dir+'/'+e.name]:[]);}
function sourcePaths(){return [...walk('lib'),...walk('benchmarks').filter(p=>!p.startsWith('benchmarks/results/')&&/\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/.test(p)),...walk('node_modules/@hivetech/poker-engine'),...walk('node_modules/zod'), 'node_modules/typescript/package.json','node_modules/typescript/lib/typescript.js','package.json','package-lock.json',...evidencePaths].sort();}
function read(path){return JSON.parse(gunzipSync(readFileSync(path)).toString());}
function immutable(path,value,zip=false){const bytes=zip?gzipSync(JSON.stringify(value)):Buffer.from(JSON.stringify(value,null,2)+'\n');if(existsSync(path)){const old=zip?read(path):JSON.parse(readFileSync(path));if(JSON.stringify(old)!==JSON.stringify(value))throw new Error('Immutable artifact differs: '+path);}else writeFileSync(path,bytes,{flag:'wx'});}
async function connect(){
  worker=new Worker(new URL('./worker.mjs',import.meta.url),{env:{NODE_ENV:'test',EXTERNAL_INFERENCE_ENABLED:'false'},execArgv:[]});
  function next(){return new Promise((resolve,reject)=>{
    const clean=()=>{worker.off('message',message);worker.off('error',error);worker.off('exit',exit);};
    const message=m=>{clean();if(m.error)reject(new Error(m.error));else resolve(m);};
    const error=e=>{clean();reject(e);};const exit=()=>{clean();reject(new Error('Worker stopped; completed checkpoints retained'));};
    worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
  });}
  await next();
  return async(spec,selection)=>{if(stopped)throw new Error('Stopped; completed checkpoints retained');const reply=next();worker.postMessage({spec,selection});return(await reply).result;};
}
try{
  const freezePath=dir+'freeze-v1.json',bundlePath=dir+'source-v1.json.gz',evidencePath=dir+'motivation-v1.json.gz';
  if(!existsSync(freezePath)){
    if(mode!=='smoke')throw new Error('Run smoke first to freeze sources/configuration before development');
    const evidence=verifyEvidence();
    const source=Object.fromEntries(sourcePaths().map(p=>[p,readFileSync(p).toString('base64')]));
    immutable(bundlePath,source,true);immutable(evidencePath,evidence,true);
    immutable(freezePath,{version,nodeVersion:process.version,configuration,responseTables,development:allocation('development'),confirmation:allocation('confirmation'),files:Object.fromEntries(Object.entries(source).map(([p,b])=>[p,hash(Buffer.from(b,'base64'))])),bundleHash:hash(readFileSync(bundlePath)),evidenceHash:hash(readFileSync(evidencePath))});
  }
  const manifest=JSON.parse(readFileSync(freezePath));
  function verifyAll(){
    verify(manifest.files);
    if(manifest.version!==version||manifest.nodeVersion!==process.version||JSON.stringify(manifest.configuration)!==JSON.stringify(configuration)||JSON.stringify(manifest.responseTables)!==JSON.stringify(responseTables)||JSON.stringify(manifest.development)!==JSON.stringify(allocation('development'))||JSON.stringify(manifest.confirmation)!==JSON.stringify(allocation('confirmation'))||Object.keys(manifest.files).join()!==sourcePaths().join()||manifest.bundleHash!==hash(readFileSync(bundlePath))||manifest.evidenceHash!==hash(readFileSync(evidencePath)))throw new Error('Frozen source/configuration/allocation drift; use a new version, never rewrite this freeze');
    const bundle=read(bundlePath);
    if(Object.keys(bundle).join()!==Object.keys(manifest.files).join()||Object.entries(bundle).some(([p,b])=>hash(Buffer.from(b,'base64'))!==manifest.files[p]))throw new Error('Source bundle mismatch');
  }
  verifyAll();
  const manifestHash=hash(readFileSync(freezePath));
  const mechanicalPath=dir+'mechanical-v1.json';
  function mechanical(){
    if(!existsSync(mechanicalPath))throw new Error('Successful smoke required');
    const m=JSON.parse(readFileSync(mechanicalPath));
    if(m.manifestHash!==manifestHash||m.passed!==true||m.samples!==5000)throw new Error('Mechanical gate incompatible');
  }
  function phasePath(phase){return local+phase+'.json.gz';}
  function readRows(phase,selection={},required=true){
    const specs=allocation(phase).filter(s=>phase==='development'||selection[s.hand]);
    const rows=[];
    for(const spec of specs){const path=local+spec.id.replaceAll(':','-')+'.json.gz';
      if(!existsSync(path)){if(required)throw new Error('Incomplete phase: '+spec.id);continue;}
      rows.push(parse(readFileSync(path),manifestHash,spec,selection));
    }
    if(existsSync(phasePath(phase))){const archive=read(phasePath(phase));if(archive.manifestHash!==manifestHash||archive.mechanicalHash!==hash(readFileSync(mechanicalPath))||JSON.stringify(archive.selection)!==JSON.stringify(selection)||JSON.stringify(archive.rows)!==JSON.stringify(rows))throw new Error('Phase archive mismatch');}
    return rows;
  }
  function selectionRead(){
    const path=local+'selection.json';if(!existsSync(path))throw new Error('Completed development and frozen selection required');
    const s=JSON.parse(readFileSync(path));
    if(s.manifestHash!==manifestHash||!existsSync(phasePath('development'))||s.developmentHash!==hash(readFileSync(phasePath('development')))||JSON.stringify(s.selected)!==JSON.stringify(select(readRows('development'))))throw new Error('Selection drift');
    return s.selected;
  }
  if(mode==='smoke'){
    // Focused mechanics run in a clean worker, never counted in the study allocation.
    const {mechanicalChecks}=await import('./mechanical.ts');
    const checks=await mechanicalChecks();
    const run=await connect();
    const row=await run({...allocation('development')[0],id:version+':smoke:AA:0:1:0'},{});
    if(row.failure)throw new Error('Smoke rollout failed: '+row.failure+' at '+row.failedArm);
    verifyAll();immutable(mechanicalPath,{manifestHash,passed:true,samples:5000,checks,smoke:row});
    console.log(JSON.stringify({mode,passed:true,pairedRollouts:24,freeze:freezePath,mechanical:mechanicalPath,sourceBundle:bundlePath}));
  }
  if(mode==='development'||mode==='confirmation'){
    mechanical();const selection=mode==='confirmation'?selectionRead():{};
    const specs=allocation(mode).filter(s=>mode==='development'||selection[s.hand]);
    const run=specs.length?await connect():null;let completed=0;
    for(const spec of specs){
      const path=local+spec.id.replaceAll(':','-')+'.json.gz';
      const row=existsSync(path)?parse(readFileSync(path),manifestHash,spec,selection):await run(spec,selection);
      save(path,manifestHash,row,selection);completed++;
      if(row.failure)throw new Error(`Failed paired block retained: ${path}; advancement prohibited (${row.failure})`);
      if(completed%12===0||completed===specs.length)console.log(`${mode}: ${completed}/${specs.length} whole paired blocks saved`);
    }
    verifyAll();const rows=readRows(mode,selection);
    immutable(phasePath(mode),{manifestHash,selection,mechanicalHash:hash(readFileSync(mechanicalPath)),rows},true);
    if(mode==='development'){
      const selected=select(rows);immutable(local+'selection.json',{manifestHash,developmentHash:hash(readFileSync(phasePath(mode))),selected});
      console.log('Frozen selected total chips (BB = chips/2): '+JSON.stringify(selected));
    }
    console.log('Saved '+phasePath(mode)+'; run analyze for intervals/report');
  }
  if(mode==='analyze'){
    mechanical();
    const development=readRows('development',{},false), selection=existsSync(local+'selection.json')?selectionRead():{};
    const confirmation=readRows('confirmation',selection,false);
    const report={version,manifestHash,selection,plannedComparisons:12,bootstrapResamples:20000,
      development:analyze(development,'development',selection),confirmation:analyze(confirmation,'confirmation',selection),
      limitations:'Conditional action values under offline substitutes; neither actual Jev returns, GTO values nor proven playing-strength gains. Approximate stratified bootstrap coverage. No whole-range or BB/100 extrapolation. Synthetic opponents are not calibrated human ranges. No provider spending or automatic override authorized.'};
    verifyAll();writeFileSync(local+'analysis.json',JSON.stringify(report,null,2)+'\n');
    const shortlist=report.confirmation.filter(h=>h.conclusion==='shortlist-for-separate-Jev-plan');
    const conclusion=shortlist.length?'Shortlist '+shortlist.map(h=>`${h.hand} at ${selection[h.hand]/2} BB`).join(' and ')+' for a separate Jev intervention and paid-confirmation plan.':'Defer, retaining current production behavior.';
    writeFileSync(local+'report.md',`# Jev AA/KK conditional opening values v1\n\n${conclusion}\n\n${report.limitations}\n\nHero continuations are current medium Rules and a conservative check/call/fold control, neither is Jev. All six cells must pass for each hand. Twelve planned confirmation comparisons are retained even if one hand qualifies.\n\nDevelopment blocks: ${development.length}/192. Confirmation blocks: ${confirmation.length}. Selection (total chips): ${JSON.stringify(selection)}.\n\nFull metrics, paired intervals, frequencies, later contributions, worst losses, failures and stratum counts: [analysis.json](analysis.json).\n`);
    console.log(JSON.stringify({conclusion,developmentBlocks:development.length,confirmationBlocks:confirmation.length,hands:hands.map(hand=>({hand,result:report.confirmation.find(h=>h.hand===hand).conclusion})),analysis:local+'analysis.json',report:local+'report.md'}));
  }
}finally{await worker?.terminate();release();}
