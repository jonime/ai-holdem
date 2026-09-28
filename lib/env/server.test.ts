import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLlmBotModels,
  getSupabaseServerEnv,
  getTypesafeServerEnv,
  llmReasoningEfforts,
} from "./server";

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const originalTypesafeApiKey = process.env.TYPESAFE_API_KEY;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SECRET_KEY = originalSupabaseSecretKey;
  process.env.TYPESAFE_API_KEY = originalTypesafeApiKey;
});

describe("getLlmBotModels", () => {
  it.each(llmReasoningEfforts)("accepts the %s reasoning effort", (reasoning) => {
    vi.stubEnv(
      "LLM_BOT_MODELS",
      JSON.stringify([
        { id: "configured", label: "Configured", modelId: "vendor/model", reasoning },
      ]),
    );

    expect(getLlmBotModels()).toEqual([
      { id: "configured", label: "Configured", modelId: "vendor/model", reasoning },
    ]);
  });

  it("defaults omitted reasoning to minimal", () => {
    vi.stubEnv(
      "LLM_BOT_MODELS",
      JSON.stringify([
        { id: "legacy", label: "Legacy", modelId: "vendor/model" },
      ]),
    );

    expect(getLlmBotModels()).toEqual([
      {
        id: "legacy",
        label: "Legacy",
        modelId: "vendor/model",
        reasoning: "minimal",
      },
    ]);
  });

  it("rejects an unsupported reasoning effort", () => {
    vi.stubEnv(
      "LLM_BOT_MODELS",
      JSON.stringify([
        {
          id: "invalid",
          label: "Invalid",
          modelId: "vendor/model",
          reasoning: "maximum",
        },
      ]),
    );

    expect(getLlmBotModels).toThrow(
      "LLM_BOT_MODELS contains an invalid model definition",
    );
  });
});

describe("getSupabaseServerEnv", () => {
  it("rejects missing Supabase credentials", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    expect(getSupabaseServerEnv).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("does not require a TypeSafe key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "supabase-secret";
    delete process.env.TYPESAFE_API_KEY;

    expect(getSupabaseServerEnv()).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabaseSecretKey: "supabase-secret",
    });
  });
});

describe("getTypesafeServerEnv", () => {
  it("rejects a missing TypeSafe key", () => {
    delete process.env.TYPESAFE_API_KEY;

    expect(getTypesafeServerEnv).toThrow("TYPESAFE_API_KEY");
  });
});
