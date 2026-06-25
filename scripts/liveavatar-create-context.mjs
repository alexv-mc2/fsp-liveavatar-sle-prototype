#!/usr/bin/env node
/**
 * Local-only helper: create a minimal LiveAvatar context via POST /v1/contexts.
 * Reads LIVEAVATAR_API_KEY or HEYGEN_API_KEY from the environment. Never commit secrets.
 *
 * Usage:
 *   export LIVEAVATAR_API_KEY=...   # or HEYGEN_API_KEY
 *   node scripts/liveavatar-create-context.mjs
 *
 * Optional env:
 *   LIVEAVATAR_BASE_URL (default https://api.liveavatar.com)
 *   LIVEAVATAR_CONTEXT_NAME (default FSP SLE minimal patient)
 */

const apiKey = process.env.LIVEAVATAR_API_KEY?.trim() || process.env.HEYGEN_API_KEY?.trim();
const baseUrl = (process.env.LIVEAVATAR_BASE_URL ?? "https://api.liveavatar.com").replace(/\/+$/, "");
const name = process.env.LIVEAVATAR_CONTEXT_NAME?.trim() ?? "FSP SLE minimal patient";

const MINIMAL_PROMPT =
  "Du bist eine fiktive Patientin in einer deutschen Fachsprachprüfungs-Übung. " +
  "Antworte nur auf Deutsch, kurz und patientenorientiert. " +
  "Keine Diagnosen, keine Laborwerte, keine Behandlungsempfehlungen.";

const MINIMAL_OPENING =
  "Guten Tag. Ich bin wegen meiner Beschwerden hier.";

if (!apiKey) {
  console.error("Missing LIVEAVATAR_API_KEY or HEYGEN_API_KEY in environment.");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/v1/contexts`, {
  method: "POST",
  headers: {
    "X-API-KEY": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name,
    prompt: MINIMAL_PROMPT,
    opening_text: MINIMAL_OPENING,
  }),
});

const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error("LiveAvatar create context failed:", response.status);
  if (payload?.message) {
    console.error(payload.message);
  }
  process.exit(1);
}

const contextId = payload?.data?.id ?? payload?.data?.context_id ?? payload?.id;
if (!contextId) {
  console.error("Response did not include context id. Inspect provider response manually.");
  process.exit(1);
}

console.log("Created LiveAvatar context.");
console.log(`context_id=${contextId}`);
console.log("Set HEYGEN_LIVEAVATAR_CONTEXT_ID or LIVEAVATAR_CONTEXT_ID in Vercel/local env.");
