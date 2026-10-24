import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Instrument only the disposable production-test source copy, never the application checkout. */
export function installTableReadFault(workspace) {
  const playSource = join(workspace, "app/[lang]/play/page.tsx");
  let playContents = readFileSync(playSource, "utf8");
  for (const [component, tab] of [["PersonalContent", "personal"], ["DirectoryContent", "public"], ["SharedContent", "shared"]]) {
    const start = playContents.indexOf(`export async function ${component}`);
    const position = playContents.indexOf("const store = await cookies();", start);
    if (start < 0 || position < 0) throw new Error("Play-read test injection target changed.");
    const end = position + "const store = await cookies();".length;
    playContents = playContents.slice(0, end) + `\n  await delayPlayRead("${tab}");` + playContents.slice(end);
  }
  writeFileSync(playSource, `import { delayPlayRead } from "./play-read-fault";\n${playContents}`);
  writeFileSync(join(workspace, "app/[lang]/play/play-read-fault.ts"), `
import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
export async function delayPlayRead(tab: string) {
  const marker = join(process.cwd(), "play-read-delay-" + tab);
  const deadline = Date.now() + 20000;
  while (existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
}
`);

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
