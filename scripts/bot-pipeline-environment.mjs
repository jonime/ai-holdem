import { localEnvironment } from './e2e/local-environment.mjs';

/** Allowlist the process environment; never forward application/provider settings. */
/** @param {Record<string, string | undefined>} inherited */
export function botPipelineEnvironment(inherited = process.env, local = localEnvironment()) {
  const env = {};
  for (const name of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'CI', 'GITHUB_ACTIONS']) {
    if (inherited[name]) env[name] = inherited[name];
  }
  return {
    ...env,
    NODE_ENV: 'test',
    NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: local.SUPABASE_SECRET_KEY,
    USAGE_LIMIT_HASH_SECRET: local.USAGE_LIMIT_HASH_SECRET,
    USAGE_LIMIT_TEST_IP: '127.0.0.1',
    LLM_BOT_MODELS: local.LLM_BOT_MODELS,
    EXTERNAL_INFERENCE_ENABLED: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
