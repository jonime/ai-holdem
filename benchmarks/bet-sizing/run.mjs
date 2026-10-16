import '../bot-audit/runtime.mjs';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
const mode = process.argv[2];
const directory = 'benchmarks/bet-sizing/';
if (!['offline','prepare','live','analyze'].includes(mode)) throw new Error('Use offline, prepare, live or analyze');
if (mode === 'live' && existsSync('.env.test')) loadEnvFile('.env.test');
if (mode !== 'live') { process.env.EXTERNAL_INFERENCE_ENABLED = 'false'; globalThis.fetch = () => { throw new Error('Offline network forbidden'); }; }
const { prepare } = await import('./experiment.ts');
const { digest, verifyFreeze, atomicWrite } = await import('../bot-audit/safety.ts');
const { analyze } = await import('./analysis.ts');
mkdirSync('benchmarks/results', { recursive: true });
function walk(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(f => f.isDirectory() ? walk(`${dir}/${f.name}`) : /\.(ts|mjs|js)$/.test(f.name) ? [`${dir}/${f.name}`] : []); }
function sources() { return Object.fromEntries([...walk('lib'), ...walk('benchmarks').filter(p => !p.startsWith('benchmarks/results/')), ...walk('node_modules/@hivetech/poker-engine'), 'package.json','package-lock.json'].sort().map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])); }
if (mode === 'prepare') {
  if (existsSync(directory+'plan.json') || existsSync(directory+'freeze.json')) throw new Error('Existing freeze is immutable');
  const p = prepare(), { configuration } = await import('./providers.ts');
  const manifest = { version: p.version, fixtureVersion: p.fixtureVersion, screening: p.screening, configuration, cap: 1000, prescribed: 960, compatibility: 0, files: sources(), plan: p.plan,
    fixtures: p.matrix.map(f => ({ id:f.id, condition:f.condition, control:f.control, availability:f.availability, hash:digest(f.context), variants:Object.fromEntries(Object.entries(f.variants).map(([m,c])=>[m,digest(c)])) })) };
  writeFileSync(directory+'plan.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  writeFileSync(directory+'freeze.json',JSON.stringify({files:manifest.files,planHash:digest(manifest)},null,2)+'\n',{flag:'wx'});
  console.log('Frozen 960 prescribed requests, no compatibility calls; no inference performed.');
} else if (mode === 'live') {
  const { preflight, Ledger } = await import('./safety.ts'); preflight();
  const manifest=JSON.parse(readFileSync(directory+'plan.json')), freeze=JSON.parse(readFileSync(directory+'freeze.json'));
  verifyFreeze(freeze.files);
  if(digest(manifest)!==freeze.planHash || digest(manifest.files)!==digest(freeze.files)) throw new Error('Changed manifest');
  const p=prepare(); if(digest(p.plan)!==digest(manifest.plan)) throw new Error('Changed fixed inputs');
  const { networkPreflight }=await import('./network-preflight.ts'); await networkPreflight();
  const { liveBot }=await import('./providers.ts'), { observe }=await import('./experiment.ts');
  const ledger=new Ledger(directory+'live-ledger.json',manifest);
  try {
    for(const entry of p.plan) {
      verifyFreeze(freeze.files);
      const slot=ledger.reserve(entry);
      const row=await observe(liveBot(entry.provider,entry.menu,()=>ledger.request(slot)),entry,p);
      ledger.complete(slot,row);
      atomicWrite(directory+'live-summary.json',analyze(ledger.slots.flatMap(s=>s.row?[s.row]:[])));
      if(row.failure) throw new Error('Pilot stopped at first failure; partial evidence saved.');
    }
  } catch { ledger.stop(); throw new Error('Pilot stopped. Inspect sanitized ledger and analyze partial evidence; never resume or replay this allocation.'); }
  console.log('960 prescribed requests complete; unused ceiling cannot fund additional calls.');
} else if (mode === 'analyze') {
  const evidence=JSON.parse(readFileSync(process.argv[3]??directory+'live-ledger.json'));
  const report=analyze(evidence.slots.flatMap(s=>s.row?[s.row]:[]));
  report.reservedAttempts=evidence.slots.length; report.sentAttempts=evidence.slots.reduce((n,s)=>n+s.requests,0); report.incompleteReservations=evidence.slots.filter(s=>!s.row).length;
  atomicWrite('benchmarks/results/bet-sizing-analysis.json',report); console.log('Report written; no inference.');
} else {
  const { offline }=await import('./offline.ts');
  atomicWrite('benchmarks/results/bet-sizing-offline.json',{ sourceFiles: sources(), ...await offline() }); console.log('Offline matrix, provider compatibility and engine checks passed.');
}
