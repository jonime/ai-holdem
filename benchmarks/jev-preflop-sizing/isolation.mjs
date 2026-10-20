import '../bot-audit/runtime.mjs';
import {registerHooks, builtinModules} from 'node:module';
const forbidden = /^(?:node:)?(?:net|tls|http|https|http2|dns|dgram|child_process|cluster)(?:\/|$)/;
registerHooks({resolve(specifier,context,next){
  if(forbidden.test(specifier) && (specifier.startsWith('node:') || builtinModules.includes(specifier))) throw new Error('Offline I/O forbidden: '+specifier);
  return next(specifier,context);
}});
globalThis.fetch=()=>{throw new Error('Offline fetch forbidden');};
globalThis.WebSocket=class {constructor(){throw new Error('Offline WebSocket forbidden');}};
