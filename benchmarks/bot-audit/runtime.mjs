// Same Node 24 module-hook approach as benchmarks/equity-rules/worker.mjs.
// No environment-file loading, server sockets, provider resolution or inference.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../',import.meta.url));
registerHooks({ resolve(specifier,context,nextResolve) {
  if(specifier==='server-only') return {url:'data:text/javascript,export{}',shortCircuit:true};
  const target=specifier.startsWith('@/') ? pathToFileURL(root+specifier.slice(2)) : specifier.startsWith('.') ? new URL(specifier,context.parentURL) : null;
  if(target?.protocol==='file:'&&existsSync(fileURLToPath(target)+'.ts')) return nextResolve(target.href+'.ts',context);
  return nextResolve(specifier,context);
},load(url,context,nextLoad) {
  if(url.startsWith('file:')&&url.endsWith('.ts')) return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:fileURLToPath(url)}).outputText,shortCircuit:true};
  return nextLoad(url,context);
}});
