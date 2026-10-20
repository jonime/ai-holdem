import './isolation.mjs';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = JSON.parse(gunzipSync(readFileSync(new URL('./historical-sources-v1.json.gz',import.meta.url))));
const freeze = JSON.parse(readFileSync(root+'benchmarks/bet-sizing/freeze.json'));
for (const [p,h] of Object.entries(freeze.files)) if(createHash('sha256').update(bundle.files[p]??'').digest('hex')!==h) throw new Error('Historical source mismatch: '+p);
registerHooks({resolve(specifier,context,next) {
  if(specifier==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
  const target=specifier.startsWith('@/')?pathToFileURL(root+specifier.slice(2)):specifier.startsWith('.')?new URL(specifier,context.parentURL):null;
  if(target?.protocol==='file:'){
    const p=fileURLToPath(target).slice(root.length);
    if(bundle.files[p+'.ts']!==undefined)return {url:target.href+'.ts',shortCircuit:true};
  }
  return next(specifier,context);
},load(url,context,next){
  if(url.startsWith(pathToFileURL(root).href)){
    const p=fileURLToPath(url).slice(root.length);
    if ((p.startsWith('lib/')||p.startsWith('benchmarks/')||p.startsWith('node_modules/@hivetech/')) && !Object.hasOwn(bundle.files,p)) throw new Error('Unfrozen historical import: '+p);
    if(Object.hasOwn(bundle.files,p)){
      const source=bundle.files[p];
      if(p.endsWith('.ts'))return {format:'module',source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:p}).outputText,shortCircuit:true};
      if(p.endsWith('.js')||p.endsWith('.mjs'))return {format:'module',source,shortCircuit:true};
    }
  }
  return next(url,context);
}});
const {fixtures}=await import('../bet-sizing/fixtures.ts');
const {createMoveOptions}=await import('../../lib/systemone/questions.ts');
const {pokerEngineAdapter:engine}=await import('../../lib/poker/adapter.ts');
const {digest}=await import('../bot-audit/safety.ts');
const matrix=fixtures();
parentPort.postMessage(matrix.filter(f=>['2-river-0','2-river-1'].includes(f.id)).map(f=>({
  id:f.id,state:f.state,currentHand:f.currentHand,context:f.context,
  variants:Object.fromEntries(['current','quarter-pot'].map(menu=>[menu,{context:f.variants[menu],hash:digest(f.variants[menu]),candidates:createMoveOptions(f.variants[menu],menu).map(m=>m.action)}])),
  view:engine.decisionView(f.state),initialView:engine.decisionView(f.currentHand.initialState),
  transcript:f.currentHand.actions.map(a=>({sequence:a.sequence,seat:engine.decisionView(a.stateBefore).currentActorSeat,street:engine.decisionView(a.stateBefore).street,action:a.action})),
  heroCards:engine.heroCards(f.state,engine.snapshot(f.state).currentActorId)
})));
