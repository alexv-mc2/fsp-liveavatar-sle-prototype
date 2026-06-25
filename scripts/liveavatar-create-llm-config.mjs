#!/usr/bin/env node
/**
 * Local-only helper: register secret + create LiveAvatar LLM configuration for FSP Custom LLM.
 * Reads API keys from the environment. Never commit secrets.
 *
 * Official flow (docs.liveavatar.com/docs/full-mode/custom-llm):
 * 1. POST /v1/secrets → secret_id (required even when Custom LLM endpoint has no auth)
 * 2. POST /v1/llm-configurations → llm_configuration_id
 *
 * Usage:
 *   export LIVEAVATAR_API_KEY=...   # or HEYGEN_API_KEY
 *   export FSP_PUBLIC_BASE_URL=https://fsp-liveavatar-sle-prototype.vercel.app
 *   node scripts/liveavatar-create-llm-config.mjs
 *
 * Optional env:
 *   LIVEAVATAR_BASE_URL (default https://api.liveavatar.com)
 *   LIVEAVATAR_LLM_DISPLAY_NAME (default FSP SLE Custom LLM)
 *   LIVEAVATAR_LLM_MODEL_NAME (default fsp-sle-deterministic-mock-v0)
 *   LIVEAVATAR_LLM_SECRET_TYPE (default OPENAI_API_KEY — provider label for OpenAI-compatible custom endpoints; does NOT route to OpenAI when base_url is our Vercel backend)
 *   LIVEAVATAR_LLM_SECRET_VALUE (default fsp-custom-llm-no-auth — our /v1/chat/completions does not require auth yet; LiveAvatar may still store/send a bearer value)
 */

const ALLOWED_SECRET_TYPES = new Set([
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "GEMINI_API_KEY",
]);

const apiKey = process.env.LIVEAVATAR_API_KEY?.trim() || process.env.HEYGEN_API_KEY?.trim();
const publicBase =
  process.env.FSP_PUBLIC_BASE_URL?.trim() ||
  process.env.VERCEL_URL?.trim() ||
  "https://fsp-liveavatar-sle-prototype.vercel.app";
const baseUrl = (process.env.LIVEAVATAR_BASE_URL ?? "https://api.liveavatar.com").replace(/\/+$/, "");
const displayName = process.env.LIVEAVATAR_LLM_DISPLAY_NAME?.trim() ?? "FSP SLE Custom LLM";
const modelName = process.env.LIVEAVATAR_LLM_MODEL_NAME?.trim() ?? "fsp-sle-deterministic-mock-v0";
const secretType = process.env.LIVEAVATAR_LLM_SECRET_TYPE?.trim() ?? "OPENAI_API_KEY";
const secretValue =
  process.env.LIVEAVATAR_LLM_SECRET_VALUE?.trim() ?? "fsp-custom-llm-no-auth";

function normalizePublicBaseUrl(raw) {
  const normalized = raw.replace(/\/+$/, "");
  return normalized.startsWith("http") ? normalized : `https://${normalized}`;
}

/** LiveAvatar appends /chat/completions; our route is /v1/chat/completions → base_url ends with /v1 */
function buildLlmConfigBaseUrl(publicBaseUrl) {
  return `${normalizePublicBaseUrl(publicBaseUrl).replace(/\/+$/, "")}/v1`;
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message ?? `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${message}`);
  }
  return payload;
}

if (!apiKey) {
  console.error("Missing LIVEAVATAR_API_KEY or HEYGEN_API_KEY in environment.");
  process.exit(1);
}

if (!ALLOWED_SECRET_TYPES.has(secretType)) {
  console.error(
    `Invalid LIVEAVATAR_LLM_SECRET_TYPE. Allowed: ${[...ALLOWED_SECRET_TYPES].join(", ")}`,
  );
  process.exit(1);
}

const llmBaseUrl = buildLlmConfigBaseUrl(publicBase);

console.log(`Using LLM base_url: ${llmBaseUrl} (LiveAvatar will call ${llmBaseUrl}/chat/completions)`);
console.log(
  `Using secret_type label: ${secretType} (OpenAI-compatible custom backend only; not routing to OpenAI)`,
);

const secretPayload = await postJson("/v1/secrets", {
  secret_type: secretType,
  secret_value: secretValue,
  secret_name: "FSP SLE Custom LLM (Vercel backend)",
});

const secretId = secretPayload?.data?.id ?? secretPayload?.data?.secret_id;
if (!secretId) {
  console.error("Secret creation succeeded but id was missing from response.");
  process.exit(1);
}

const llmPayload = await postJson("/v1/llm-configurations", {
  display_name: displayName,
  model_name: modelName,
  secret_id: secretId,
  base_url: llmBaseUrl,
});

const llmConfigurationId = llmPayload?.data?.id ?? llmPayload?.data?.llm_configuration_id;
if (!llmConfigurationId) {
  console.error("LLM configuration created but id was missing from response.");
  process.exit(1);
}

console.log("Created LiveAvatar LLM configuration.");
console.log(`llm_configuration_id=${llmConfigurationId}`);
console.log("Set HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID or LIVEAVATAR_LLM_CONFIGURATION_ID in Vercel/local env.");
