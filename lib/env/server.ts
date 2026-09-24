import "server-only";

export interface SupabaseServerEnv {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

export interface TypesafeServerEnv {
  readonly typesafeApiKey: string;
}

/**
 * When true, the step route uses FakeTypesafeClient instead of calling the
 * real TypeSafe/jev model. Intended for e2e runs only.
 */
export function isFakeTypesafeModeEnabled(): boolean {
  return process.env.TYPESAFE_FAKE_MODE === "true";
}

function requiredServerVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnv(): SupabaseServerEnv {
  return {
    supabaseUrl: requiredServerVariable("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseSecretKey: requiredServerVariable("SUPABASE_SECRET_KEY"),
  };
}

export function getTypesafeServerEnv(): TypesafeServerEnv {
  return {
    typesafeApiKey: requiredServerVariable("TYPESAFE_API_KEY"),
  };
}
