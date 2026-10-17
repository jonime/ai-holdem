import '../bot-audit/runtime.mjs';
import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
const forbidden = () => { throw new Error('Offline network forbidden'); };
globalThis.fetch = forbidden;
net.connect = net.createConnection = net.Socket.prototype.connect = forbidden;
http.request = http.get = https.request = https.get = tls.connect = forbidden;
syncBuiltinESMExports();
if (Object.keys(process.env).some(k => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))) throw new Error('Credential in worker');
const { makeFixtures } = await import('./fixtures.ts');
const { experiment, report } = await import('./experiment.ts');
const directory = 'benchmarks/river-lookahead/';
const hash = data => createHash('sha256').update(data).digest('hex');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(`${dir}/${f.name}`) : /\.(ts|mjs|js)$/.test(f.name) ? [`${dir}/${f.name}`] : []);
const paths = [...walk('lib'), ...walk(directory.slice(0,-1)), ...walk('node_modules/@hivetech/poker-engine'), 'benchmarks/range-equity/calculator.ts', 'benchmarks/range-equity/showdown.ts', 'benchmarks/bot-audit/runtime.mjs', 'package-lock.json'].sort();
const sources = Object.fromEntries(paths.map(p => [p, hash(readFileSync(p))]));
const fixtures = makeFixtures();
const freezePath = directory + 'freeze-v1.json';
const manifest = { version: 'river-lookahead-v1', engine: '1.0.1', files: sources, fixtures, configuration: { difficulties: ['easy', 'medium', 'hard'], equityBudget: 'production-default', continuation: 'posterior-optimal-fold-call', comparison: 'root-action', exact: true } };
if (workerData.mode === 'freeze') {
  if (existsSync(freezePath)) throw new Error('Freeze exists; preserve evidence and use a new version');
  writeFileSync(freezePath, JSON.stringify(manifest,null,2)+'\n', { flag: 'wx' });
  parentPort.postMessage('Frozen explicit inputs and sources; no baseline decisions collected.');
} else {
  const frozen = JSON.parse(readFileSync(freezePath));
  if (JSON.stringify(frozen) !== JSON.stringify(manifest)) throw new Error('Frozen inputs or source hashes changed');
  const started = performance.now();
  const result = await experiment(frozen.fixtures, workerData.mode === 'smoke');
  const evidence = { manifestHash: hash(readFileSync(freezePath)), node: process.version, runtimeMs: performance.now()-started, ...result };
  if (workerData.mode === 'full') {
    // Recheck the freeze after execution; completed evidence is immutable.
    for (const [p,h] of Object.entries(sources)) if (hash(readFileSync(p)) !== h) throw new Error('Sources changed during run');
    writeFileSync(directory+'evidence-v1.json', JSON.stringify(evidence,null,2)+'\n', { flag:'wx' });
    writeFileSync(directory+'report-v1.md', report(evidence), { flag:'wx' });
  }
  parentPort.postMessage(JSON.stringify({ mode:workerData.mode, runtimeMs:evidence.runtimeMs, decisions:result.baselines.length, assumptions:result.rows.length, enumerations:result.enumerations, unsupported:result.unsupported.length }));
}
