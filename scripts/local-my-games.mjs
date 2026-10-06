/** Rollback-only local SQL checks; no application environment or provider access. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "::1"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
execFileSync("docker", ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], {
  input: readFileSync(new URL("../test/sql/my-games.sql", import.meta.url), "utf8"), encoding: "utf8", timeout: 30000,
});
console.log("Personal tables: ownership, deduplication, counts, statuses, ordering, limits and roles passed.");
