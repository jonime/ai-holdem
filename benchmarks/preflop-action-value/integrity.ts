import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export function verify(files: Record<string, string>) {
  if (Object.keys(files).length === 0) throw new Error("Empty source freeze");
  for (const [path, digest] of Object.entries(files)) if (hash(readFileSync(path)) !== digest) throw new Error(`Source freeze mismatch: ${path}`);
}
