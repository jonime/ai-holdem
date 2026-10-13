import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Instrument only the disposable production-test source copy, never the application checkout. */
export function installTableReadFault(workspace) {
  const source = join(workspace, "app/[lang]/game/[gameId]/GamePageContent.tsx");
  const contents = readFileSync(source, "utf8");
  const lookup = "await getPublicGame(createSupabaseGameRepository(), gameId);";
  if (!contents.includes(lookup)) throw new Error("Table-read test injection target changed.");
  writeFileSync(source, `import { failTableRead } from "./table-read-fault";\n${contents.replace(lookup, `await failTableRead(gameId);\n    ${lookup}`)}`);
  writeFileSync(join(workspace, "app/[lang]/game/[gameId]/table-read-fault.ts"), `
import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export async function failTableRead(gameId: string) {
  const delay = join(process.cwd(), "table-read-delay-" + gameId);
  const deadline = Date.now() + 20000;
  while (existsSync(delay) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const marker = join(process.cwd(), "table-read-failure-" + gameId);
  if (!existsSync(marker)) return;
  const remaining = Number(readFileSync(marker, "utf8"));
  if (remaining <= 0) return;
  writeFileSync(marker, String(remaining - 1));
  await new Promise(resolve => setTimeout(resolve, 1000));
  throw new Error("Controlled test-only table read failure");
}
`);
}
