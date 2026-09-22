import { afterEach, describe, expect, it } from "vitest";

import { getSupabaseServerEnv, getTypesafeServerEnv } from "./server";

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const originalTypesafeApiKey = process.env.TYPESAFE_API_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.SUPABASE_SECRET_KEY = originalSupabaseSecretKey;
  process.env.TYPESAFE_API_KEY = originalTypesafeApiKey;
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
