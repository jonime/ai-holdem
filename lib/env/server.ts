import "server-only";

export interface SupabaseServerEnv {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

export interface TypesafeServerEnv {
  readonly typesafeApiKey: string;
}

export interface OpenRouterProfile {
  readonly id: string;
  readonly label: string;
  readonly modelId: string;
}

export function assertExternalInferenceEnabled(): void {
  if (process.env.EXTERNAL_INFERENCE_ENABLED === "false") {
    throw new Error("External inference is disabled");
  }
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
  assertExternalInferenceEnabled();
  return {
    typesafeApiKey: requiredServerVariable("TYPESAFE_API_KEY"),
  };
}

export function getOpenRouterApiKey(): string {
  assertExternalInferenceEnabled();
  return requiredServerVariable("OPENROUTER_API_KEY");
}

export function getOpenRouterProfiles(): readonly OpenRouterProfile[] {
  const value = process.env.OPENROUTER_BOT_PROFILES;
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("OPENROUTER_BOT_PROFILES must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("OPENROUTER_BOT_PROFILES must be a JSON array");
  }
  const ids = new Set<string>();
  return parsed.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("id" in entry) ||
      !("label" in entry) ||
      !("modelId" in entry) ||
      typeof entry.id !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.modelId !== "string" ||
      !entry.id.trim() ||
      !entry.label.trim() ||
      !entry.modelId.trim() ||
      ids.has(entry.id)
    ) {
      throw new Error("OPENROUTER_BOT_PROFILES contains an invalid profile");
    }
    ids.add(entry.id);
    return { id: entry.id, label: entry.label, modelId: entry.modelId };
  });
}
