import "server-only";

export interface SupabaseServerEnv {
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
}

export interface TypesafeServerEnv {
  readonly typesafeApiKey: string;
}

export interface LlmServerEnv {
  readonly apiEndpoint: string;
  readonly apiKey: string;
}

export const llmReasoningEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type LlmReasoningEffort = (typeof llmReasoningEfforts)[number];

export interface LlmModelDefinition {
  readonly id: string;
  readonly label: string;
  readonly modelId: string;
  readonly reasoning: LlmReasoningEffort;
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

export function getLlmServerEnv(): LlmServerEnv {
  assertExternalInferenceEnabled();
  return {
    apiEndpoint: requiredServerVariable("LLM_API_ENDPOINT"),
    apiKey: requiredServerVariable("LLM_API_KEY"),
  };
}

function isLlmReasoningEffort(value: unknown): value is LlmReasoningEffort {
  return llmReasoningEfforts.some((effort) => effort === value);
}

export function getLlmBotModels(): readonly LlmModelDefinition[] {
  const value = process.env.LLM_BOT_MODELS;
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("LLM_BOT_MODELS must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("LLM_BOT_MODELS must be a JSON array");
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
      ("reasoning" in entry && !isLlmReasoningEffort(entry.reasoning)) ||
      ids.has(entry.id)
    ) {
      throw new Error("LLM_BOT_MODELS contains an invalid model definition");
    }
    ids.add(entry.id);
    return {
      id: entry.id,
      label: entry.label,
      modelId: entry.modelId,
      reasoning: "reasoning" in entry ? entry.reasoning : "minimal",
    };
  });
}
