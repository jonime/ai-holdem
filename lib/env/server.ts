import "server-only";

export interface SupabaseServerEnv {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

export interface TypesafeServerEnv {
  readonly typesafeApiKey: string;
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
