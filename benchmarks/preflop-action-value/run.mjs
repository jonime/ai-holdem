import '../bot-audit/runtime.mjs';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
globalThis.fetch = () => { throw new Error('Offline network forbidden'); };
const { groups, version, summarize } = await import('./experiment.ts');
const directory = 'benchmarks/preflop-action-value/';
const local = 'benchmarks/results/preflop-action-value-v1/';
const { hash, verify } = await import('./integrity.ts');
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(`${dir}/${f.name}`) : /\.(ts|mjs|js)$/.test(f.name) ? [`${dir}/${f.name}`] : []); }
function sources() { return Object.fromEntries([...walk('lib'), ...walk('benchmarks').filter(p => !p.startsWith('benchmarks/results/')), ...walk('node_modules/@hivetech/poker-engine'), 'package.json', 'package-lock.json'].sort().map(p => [p, hash(readFileSync(p))])); }
async function worker(group) { return new Promise((resolve, reject) => {
  const task = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: group, env: { EXTERNAL_INFERENCE_ENABLED: 'false', NODE_ENV: 'test' }, execArgv: [] });
  task.once('message', resolve); task.once('error', reject); task.once('exit', code => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
}); }
const mode = process.argv[2] ?? 'run';
if (mode === 'analyze') {
  const evidence = JSON.parse(gunzipSync(readFileSync(directory + 'evidence-v1.json.gz')));
  const summary = evidence.results.map(summarize);
  mkdirSync(local, { recursive: true });
  writeFileSync(local + 'analysis.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(`Reanalyzed ${summary.length} groups without inference`);
} else if (mode === 'smoke') {
  const result = await worker({ ...groups[0], samples: 8, seeds: 2 });
  console.log(JSON.stringify(summarize(result)));
  if (result.rows.some(r => r.failure)) throw new Error('Smoke failed');
} else if (mode === 'run') {
  if (existsSync(directory + 'evidence-v1.json.gz')) throw new Error('Completed evidence exists; use analyze or create a new version');
  mkdirSync(local, { recursive: true });
  const freezePath = directory + 'freeze-v1.json';
  const manifest = existsSync(freezePath) ? JSON.parse(readFileSync(freezePath)) : { version, groups, files: sources(), assumptions: { stackBB: 100, blindsBB: [0.5, 1], rake: 0, heroContinuation: 'unchanged production Equity Rules', opponentPolicies: ['frozen', 'passive', 'aggressive'], pairedDeals: 'same hand/node/seed across policies, difficulties and sample budgets', bootstrapResamples: 2000, fixedSuitRepresentatives: true, scriptedOpponentEquitySamples: 1, scriptedOpponentEquityUnused: true, contextMemoization: 'exact visible inputs only; bounded 10000 entries' } };
  verify(manifest.files);
  if (JSON.stringify(manifest.groups) !== JSON.stringify(groups) || manifest.version !== version) throw new Error('Plan mismatch');
  if (!existsSync(freezePath)) writeFileSync(freezePath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const results = [];
  const started = Date.now();
  for (let i = 0; i < groups.length; i += 3) {
    const batch = await Promise.all(groups.slice(i, i + 3).map(async (group, offset) => {
      const path = local + `group-${i + offset}.json.gz`;
      if (existsSync(path)) {
        const checkpoint = JSON.parse(gunzipSync(readFileSync(path)));
        if (checkpoint.manifestHash !== hash(JSON.stringify(manifest)) || JSON.stringify(checkpoint.result.group) !== JSON.stringify(group)) throw new Error('Checkpoint mismatch');
        return checkpoint.result;
      }
      const result = await worker(group);
      writeFileSync(path, gzipSync(JSON.stringify({ manifestHash: hash(JSON.stringify(manifest)), result })), { flag: 'wx' });
      return result;
    }));
    results.push(...batch);
    console.log(`Completed ${results.length}/${groups.length} groups (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  verify(manifest.files);
  writeFileSync(directory + 'evidence-v1.json.gz', gzipSync(JSON.stringify({ manifest, results })), { flag: 'wx' });
  writeFileSync(local + 'analysis.json', JSON.stringify(results.map(summarize), null, 2) + '\n');
  const rows = results.flatMap(r => r.rows);
  console.log(JSON.stringify({ groups: results.length, seedBlocks: rows.length, excluded: rows.filter(r => r.failure).length, uniqueRollouts: rows.reduce((sum, r) => sum + r.uniqueActions, 0) }));
} else throw new Error('Use run, smoke or analyze');
