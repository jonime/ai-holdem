/** No environment files, provider imports, credentials, sockets or inference. */
import './runtime.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { observationSchema, summarize } from './report.ts';
const input = process.argv[2] ?? 'benchmarks/bot-audit/offline-evidence.json.gz';
const output = process.argv[3] ?? 'benchmarks/bot-audit/analysis.json';
const bytes = readFileSync(input), evidence = JSON.parse(input.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8'));
if (!Array.isArray(evidence.rows) && !Array.isArray(evidence.slots)) throw new Error('Expected audit evidence or ledger');
const rows = (evidence.rows ?? evidence.slots.flatMap(s => s.observation ? [s.observation] : [])).map(r => observationSchema.parse(r));
const expected = evidence.manifest?.mechanical?.filter(m=>m.representation==='original').flatMap(m=>['jev','eevo','llm'].map(provider=>({provider,difficulty:'medium',mode:'controlled',fixture:m.fixture}))) ?? [];
const summary = summarize(rows,expected);
const interruptedReservations = evidence.slots?.filter(s => s.status === 'reserved').length ?? 0;
writeFileSync(output,JSON.stringify({ interruptedReservations, reservedDecisions: evidence.slots?.length ?? null, ...summary })+'\n');
console.log(JSON.stringify({ analyzed:rows.length,interruptedReservations,output }));
