// Node 24 benchmark worker. No application/test env files or provider credentials.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { parentPort, workerData } from "node:worker_threads";

const root = fileURLToPath(new URL("../../", import.meta.url));
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  const target = specifier.startsWith("@/") ? pathToFileURL(root + specifier.slice(2))
    : specifier.startsWith(".") ? new URL(specifier, context.parentURL) : null;
  if (target?.protocol === "file:" && existsSync(fileURLToPath(target) + ".ts"))
    return nextResolve(target.href + ".ts", context);
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".ts")) {
    const output = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, fileName: fileURLToPath(url),
    });
    return { format: "module", source: output.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
} });
const { compare } = await import("./experiment.ts");
const { opponent, difficulty, seats, blocks, samples } = workerData;
parentPort.postMessage(await compare(opponent, difficulty, seats, blocks, samples));
