// Restore only the immutable offline study, never application credentials or DB state.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

if (process.argv.length !== 3) throw new Error('Supply one new destination directory');
const root = fileURLToPath(new URL('../../', import.meta.url));
const blob = readFileSync(new URL('./baseline-source-v1.json.gz', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha(blob) !== '96b860174958bc3d0604c732009e3805ba409206795e47fbe17894ef841d70d7') throw new Error('Baseline bundle hash mismatch');
const snapshot = JSON.parse(gunzipSync(blob));
if (snapshot.version !== 1 || Object.keys(snapshot.files).length !== 350) throw new Error('Invalid baseline bundle');
for (const [path, entry] of Object.entries(snapshot.files)) {
  if (isAbsolute(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid source path');
  if (sha(Buffer.from(entry.data, 'base64')) !== entry.sha256) throw new Error('Baseline source mismatch');
  // Reuse only exactly matching installed dependencies; never write into node_modules.
  if (path.startsWith('node_modules/') && sha(readFileSync(resolve(root, path))) !== entry.sha256) throw new Error('Installed engine differs from baseline');
}
const destination = resolve(process.argv[2]);
mkdirSync(destination); // Refuse any existing destination, including symlinks.
try {
  for (const [path, entry] of Object.entries(snapshot.files)) {
    if (path.startsWith('node_modules/')) continue;
    const target = resolve(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(entry.data, 'base64'), { flag: 'wx' });
  }
  symlinkSync(resolve(root, 'node_modules'), resolve(destination, 'node_modules'), 'dir');
} catch (error) {
  rmSync(destination, { recursive: true, force: true });
  throw error;
}
console.log('Restored baseline with shared installed dependencies: ' + destination);
console.log('From that directory, run: node benchmarks/preflop-candidate/run.mjs analyze');
