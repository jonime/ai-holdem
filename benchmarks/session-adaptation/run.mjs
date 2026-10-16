import '../bot-audit/runtime.mjs';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory = 'benchmarks/session-adaptation/';
const mode = process.argv[2];
if (!['offline', 'prepare', 'live', 'report', 'startup', 'continue-prepare', 'continue-live', 'llm-prepare', 'llm-live'].includes(mode)) throw new Error('Use offline, prepare, live, report, startup, continue-prepare, continue-live, llm-prepare or llm-live');
// Report and startup never import providers, load credentials, or run simulations.
if (!['live', 'continue-live', 'llm-live'].includes(mode)) globalThis.fetch = () => { throw new Error('Offline network forbidden'); };
const { atomic, load } = await import('./storage.ts');
const { report, markdown } = await import('./report.ts');
mkdirSync('benchmarks/results', { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(`${dir}/${f.name}`) : /\.(ts|mjs|js|md)$/.test(f.name) ? [`${dir}/${f.name}`] : []);
const sources = () => Object.fromEntries([...walk('lib'), ...walk('benchmarks').filter(p => !p.startsWith('benchmarks/results/')), ...walk('node_modules/@hivetech/poker-engine'), 'package.json', 'package-lock.json'].sort().map(p => [p, hash(readFileSync(p))]));
if (mode === 'startup') console.log('Node entry point ready; no environment loaded, no inference, no simulation.');
else if (mode === 'report') {
  let evidence = load(process.argv[3] ?? directory + 'live-ledger.json');
  let lineage;
  if (!process.argv[3] && existsSync(directory + 'continuation-ledger.json')) {
    const { validateContinuation, combined } = await import('./continuation.ts');
    const manifest = JSON.parse(readFileSync(directory + 'continuation-freeze.json', 'utf8'));
    const parent = validateContinuation(manifest);
    evidence = combined(parent, load(directory + 'continuation-ledger.json'), manifest);
    lineage = { amendment: manifest.amendment, parentLedgerHash: manifest.parentLedgerHash, parentManifestHash: manifest.parentManifestHash, continuationManifestHash: manifest.manifestHash, combinedMaximum: 4489, originalIncompleteBlocksExcluded: true };
  }
  if (!process.argv[3] && existsSync(directory + 'llm-freeze.json')) {
    const { validateLlm, combinedLlm } = await import('./llm-continuation.ts');
    const manifest = JSON.parse(readFileSync(directory + 'llm-freeze.json', 'utf8'));
    const parent = validateLlm(manifest);
    evidence = existsSync(directory + 'llm-ledger.json') ? combinedLlm(parent, load(directory + 'llm-ledger.json'), manifest) : { ...parent, limits: { requestCap: 2757, priorRequests: 0, combinedCap: 2757 }, blocks: parent.blocks.map(b => manifest.skipped.some(s => s.id === b.id) ? { ...b, status: 'skipped' } : b) };
    lineage = { ...lineage, llmOnlyAmendment: manifest.amendment, llmManifestHash: manifest.manifestHash, previousLedgerHash: manifest.previousLedgerHash, skippedJevBlocks: manifest.skipped.map(b => b.id), combinedMaximum: 2757, originalIncompleteBlocksExcluded: true };
  }
  const result = { ...report(evidence), ...(lineage ? { protocolAmendment: lineage } : {}) };
  const output = process.argv[4] ?? 'benchmarks/results/session-adaptation-report';
  atomic(output + '.json', result);
  writeFileSync(output + '.md', (lineage ? `Protocol amended after interrupted runs. Combined maximum: ${lineage.combinedMaximum} reserved requests. All incomplete blocks, failures and unresolved reservations remain in the evidence. ${lineage.llmOnlyAmendment ? 'Only the two untouched LLM blocks are eligible now; the two untouched Jev blocks are skipped. At most one complete block per LLM/opponent cell; this is descriptive evidence.' : 'The first amendment permitted six untouched blocks.'}\n\n` : '') + markdown(result));
  console.log(`Report: ${output}.json; no credentials or inference clients loaded.`);
} else if (mode === 'prepare') {
  const { design, blocks } = await import('./session.ts');
  const files = sources();
  const offline = JSON.parse(readFileSync('benchmarks/results/session-adaptation-offline.json', 'utf8'));
  if (offline.handsPerEpisode !== 60 || offline.equitySamples !== 5000 || hash(JSON.stringify(files)) !== offline.sourceHash) throw new Error('Run the full offline benchmark on these exact sources before freezing');
  const manifest = { design, blocks, files, analysis: 'complete blocks only, memory minus omitted, equal seat averaging, descriptive cells and windows; no intervals; no replacement blocks', compatibilityRequests: 0 };
  writeFileSync(directory + 'freeze.json', JSON.stringify({ ...manifest, manifestHash: hash(JSON.stringify(manifest)) }, null, 2) + '\n', { flag: 'wx' });
  console.log('Frozen eight blocks / 1,920 hands / 4,800 maximum requests; no compatibility calls. No inference.');
} else if (mode === 'continue-prepare') {
  const { prepareContinuation } = await import('./continuation.ts');
  const manifest = prepareContinuation(directory + 'live-ledger.json', directory + 'freeze.json', sources());
  writeFileSync(directory + 'continuation-freeze.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log('Amendment frozen: six untouched blocks, 3,600 further reservations maximum, 4,489 combined. Original evidence preserved. No inference.');
} else if (mode === 'llm-prepare') {
  const { prepareLlm } = await import('./llm-continuation.ts');
  const manifest = prepareLlm(directory + 'continuation-ledger.json', directory + 'continuation-freeze.json', sources());
  writeFileSync(directory + 'llm-freeze.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log('LLM-only amendment frozen: two untouched LLM blocks, 1,200 further reservations, 2,757 combined. No inference.');
} else if (mode === 'live' || mode === 'continue-live' || mode === 'llm-live') {
  // Existing shell values win, matching the repository test environment convention.
  const { loadEnvFile } = await import('node:process');
  if (existsSync('.env.test')) loadEnvFile('.env.test');
  if (mode === 'llm-live') {
    const { validateLlm } = await import('./llm-continuation.ts');
    const manifest = JSON.parse(readFileSync(directory + 'llm-freeze.json', 'utf8'));
    validateLlm(manifest);
    const { live } = await import('./live.ts');
    await live(directory + 'llm-ledger.json', manifest.manifestHash, manifest.files, { blocks: manifest.scheduled, limits: manifest.limits, authorization: 'authorize-session-adaptation-llm-only-1200', beforeDispatch: () => { validateLlm(manifest); } });
    console.log('LLM-only run finished. Run report for combined evidence.');
    process.exit(0);
  }
  if (mode === 'continue-live') {
    const { validateContinuation } = await import('./continuation.ts');
    const manifest = JSON.parse(readFileSync(directory + 'continuation-freeze.json', 'utf8'));
    validateContinuation(manifest);
    const { live } = await import('./live.ts');
    await live(directory + 'continuation-ledger.json', manifest.manifestHash, manifest.files, { blocks: manifest.scheduled, limits: manifest.limits, beforeDispatch: () => { validateContinuation(manifest); } });
    console.log('Continuation finished. Run report for combined evidence.');
    process.exit(0);
  }
  const { manifestHash, ...manifest } = JSON.parse(readFileSync(directory + 'freeze.json', 'utf8'));
  if (hash(JSON.stringify(manifest)) !== manifestHash) throw new Error('Changed freeze manifest');
  const { live } = await import('./live.ts');
  await live(directory + 'live-ledger.json', manifestHash, manifest.files);
  console.log('Scheduled run finished. Run report to inspect complete and incomplete blocks.');
} else {
  process.env.EXTERNAL_INFERENCE_ENABLED = 'false';
  const { offline } = await import('./offline.ts');
  const sourceHash = hash(JSON.stringify(sources()));
  const evidence = await offline();
  if (hash(JSON.stringify(sources())) !== sourceHash) throw new Error('Sources changed during offline verification');
  atomic('benchmarks/results/session-adaptation-offline.json', { ...evidence, sourceHash });
  console.log('Offline evidence: benchmarks/results/session-adaptation-offline.json');
}
