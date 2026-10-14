import { afterAll } from "vitest";
import { assertLocalOrigin, installNetworkGuard } from "./network";

assertLocalOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
for (const key of ["EEVO_API_KEY", "TYPESAFE_API_KEY", "LLM_API_KEY", "LLM_API_ENDPOINT", "OPENAI_API_KEY", "NODE_OPTIONS"]) {
  if (process.env[key]) throw new Error("Bot pipeline requires the sanitized launcher environment");
}
afterAll(installNetworkGuard());
