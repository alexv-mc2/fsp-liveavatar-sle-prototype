# LiveAvatar session token API (FULL Mode)

**Status:** server-side session-token minting is implemented. Browser WebRTC / Push-to-Talk client wiring remains out of scope.

Production Custom LLM: `https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions`

## Official API flow

LiveAvatar FULL Mode is API-driven (not a visible HeyGen website UI):

1. **Optional:** `POST /v1/contexts` — minimal German patient role/opening only (`scripts/liveavatar-create-context.mjs`).
2. **Required for Custom LLM:** `POST /v1/secrets` then `POST /v1/llm-configurations` — `scripts/liveavatar-create-llm-config.mjs`.
   - `base_url` must be `https://fsp-liveavatar-sle-prototype.vercel.app/v1` (LiveAvatar calls `/v1/chat/completions`).
   - LiveAvatar requires a stored secret. Use `secret_type: OPENAI_API_KEY` — this is the **provider enum label for OpenAI-compatible custom endpoints**, not a route to OpenAI when `base_url` points at our Vercel backend. **No OpenAI account or key is used.**
   - Our `/v1/chat/completions` does **not** validate auth yet; the script uses a local placeholder `secret_value` unless you override `LIVEAVATAR_LLM_SECRET_VALUE`.
3. **Session token:** `POST /v1/sessions/token` with `mode: FULL`, `avatar_id`, `llm_configuration_id`, `avatar_persona` (`context_id`, `voice_id`, `language: de`), `interactivity_type: PUSH_TO_TALK`, `max_session_duration: 1200`, `is_sandbox`.
4. **Client (future):** `POST /v1/sessions/start` with `authorization: Bearer <session_token>` → LiveKit room.

FSP case content, guardrails, and hidden-fact policy stay in **`POST /v1/chat/completions`** — not in LiveAvatar context.

## Vercel environment variables

Set in **Project → Settings → Environment Variables**, then redeploy:

| Variable | Required | Notes |
| --- | --- | --- |
| `HEYGEN_API_KEY` | yes | Or local alias `LIVEAVATAR_API_KEY` |
| `HEYGEN_LIVEAVATAR_AVATAR_ID` | yes | Or `LIVEAVATAR_AVATAR_ID` |
| `HEYGEN_LIVEAVATAR_CONTEXT_ID` | yes | Or `LIVEAVATAR_CONTEXT_ID` |
| `HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID` | yes | Or `LIVEAVATAR_LLM_CONFIGURATION_ID` |
| `HEYGEN_LIVEAVATAR_VOICE_ID` | optional | Or `LIVEAVATAR_VOICE_ID` (ElevenLabs voice) |
| `FSP_PUBLIC_BASE_URL` | recommended | `https://fsp-liveavatar-sle-prototype.vercel.app` (overrides `VERCEL_URL`) |
| `LIVEAVATAR_SANDBOX` | optional | Default `true` |
| `LIVEAVATAR_MAX_SESSION_SECONDS` | optional | Default `1200` for this repo |
| `LIVEAVATAR_INTERACTIVITY_TYPE` | optional | Default `PUSH_TO_TALK` |
| `LIVEAVATAR_LANGUAGE` | optional | Default `de` |

Never commit values. Never log `HEYGEN_API_KEY` or `session_token` in application logs.

## Manual verification order

1. Add env vars in Vercel → **Redeploy**
2. `GET https://fsp-liveavatar-sle-prototype.vercel.app/api/health` — `session_token_configured: true` when env complete
3. `POST https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions` — OpenAI shape + `x_fsp.mock`
4. `POST /api/sessions` → copy `id`
5. `POST /api/integrations/heygen/session-token` with `{ "fsp_session_id": "<uuid>" }` → `status: ok`, `session_token`, `provider_session_id`
6. Open LiveAvatar session in client (future PR) with returned token

## Local setup scripts (never commit secrets)

```bash
# Minimal context (if context_id missing)
export LIVEAVATAR_API_KEY=...
node scripts/liveavatar-create-context.mjs

# LLM configuration (if llm_configuration_id missing)
export FSP_PUBLIC_BASE_URL=https://fsp-liveavatar-sle-prototype.vercel.app
node scripts/liveavatar-create-llm-config.mjs
```

## Endpoint

`POST /api/integrations/heygen/session-token`

- **503** `not_configured` — missing env (lists canonical `HEYGEN_*` names only)
- **404** — unknown `fsp_session_id`
- **502/504** — LiveAvatar API error / timeout (no secret leakage)
- **200** — `{ status: "ok", session_token, provider_session_id, ... }`

## Still mocked / deferred

- Browser WebRTC / `@heygen/liveavatar-web-sdk` UI
- Push-to-Talk audio capture
- Transcript ingestion from provider events
- Supabase session persistence
- Streaming Custom LLM (`stream: true`)
