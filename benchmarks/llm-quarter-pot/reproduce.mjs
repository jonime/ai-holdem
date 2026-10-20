// Replay the immutable study source tree; current application edits cannot amend it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const mode=process.argv[2]??'smoke';
if(process.argv.length>3||!['smoke','full','analyze'].includes(mode))throw new Error('Use smoke, full or analyze');
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory='benchmarks/llm-quarter-pot/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=readFileSync(root+directory+'source-bundle-v1.json.gz');
if(hash(bytes)!=='aa3a5642e9d76e9e907ba6fc0a402b26e70dfe33351e837e4b63a92268fae346')throw new Error('Frozen source bundle changed; defer');
const bundle=JSON.parse(gunzipSync(bytes)),manifestPath=directory+'manifest-v1.json';
if(hash(readFileSync(root+manifestPath))!==bundle.manifestHash)throw new Error('Frozen manifest changed; defer');
const manifest=JSON.parse(Buffer.from(bundle.files[manifestPath],'base64'));
if(hash(Buffer.from(bundle.files[manifestPath],'base64'))!==bundle.manifestHash)throw new Error('Bundle manifest mismatch');
if(hash(readFileSync(root+'package-lock.json'))!==manifest.files['package-lock.json'])throw new Error('Dependencies differ from frozen study; use its archived lockfile and a separate dependency installation');
const temporary=mkdtempSync(resolve(tmpdir(),'llm-quarter-pot-v1-'));
process.once('exit',()=>rmSync(temporary,{recursive:true,force:true}));
for(const [path,encoded] of Object.entries(bundle.files)){
  const target=resolve(temporary,path),rel=relative(temporary,target);
  if(isAbsolute(path)||rel.startsWith('..')||isAbsolute(rel))throw new Error('Invalid frozen path');
  const contents=Buffer.from(encoded,'base64');
  if(manifest.files[path]&&hash(contents)!==manifest.files[path])throw new Error('Frozen file mismatch: '+path);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,contents,{flag:'wx'});
}
for(const path of Object.keys(manifest.files))if(!Object.hasOwn(bundle.files,path))throw new Error('Missing frozen source: '+path);
// Keep the archived engine; resolve other pinned packages from the installed lockfile.
for(const entry of readdirSync(root+'node_modules',{withFileTypes:true})){
  if(entry.name==='@hivetech')continue;
  symlinkSync(root+'node_modules/'+entry.name,resolve(temporary,'node_modules',entry.name),'dir');
}
const results='benchmarks/results/llm-quarter-pot-v1';
mkdirSync(root+results,{recursive:true});mkdirSync(resolve(temporary,'benchmarks/results'),{recursive:true});
symlinkSync(root+results,resolve(temporary,results),'dir');
process.chdir(temporary);
await import(pathToFileURL(resolve(temporary,directory,'run.mjs')).href);
