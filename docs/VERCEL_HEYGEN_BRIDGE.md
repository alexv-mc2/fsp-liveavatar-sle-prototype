# Vercel + HeyGen LiveAvatar bridge readiness

This slice prepares a **public HTTPS Custom LLM endpoint** for HeyGen LiveAvatar FULL Mode while keeping HeyGen disconnected and session state **in-memory only**. Supabase/Postgres persistence is deferred until the bridge is verified.

## Deployment target

| Layer | Role in this slice |
| --- | --- |
| **Vercel** | Hosts the Next.js app and API routes (`/v1/chat/completions`, `/api/health`, placeholder HeyGen routes). Target runtime for HeyGen Custom LLM callbacks. |
| **Supabase / Postgres** | **Not in this slice.** Next step after bridge smoke tests: durable sessions, transcripts, revealed facts, feedback. |
| **GitHub Pages / Codespaces** | **Not used** for this app. |

## Stable Custom LLM URL

HeyGen / LiveAvatar must call a public HTTPS endpoint of the form:

```text
https://<your-vercel-domain>/v1/chat/completions
```

**Deployed production instance (this repo):**

| Endpoint | URL |
| --- | --- |
| Base | `https://fsp-liveavatar-sle-prototype.vercel.app` |
| Custom LLM | `https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions` |
| Health | `https://fsp-liveavatar-sle-prototype.vercel.app/api/health` |

Set `FSP_PUBLIC_BASE_URL=https://fsp-liveavatar-sle-prototype.vercel.app` in Vercel if you need an explicit stable callback URL (overrides auto-injected `VERCEL_URL`).

Compatibility alias: `POST /chat/completions` (same handler).

Correlation for FSP session continuity:

- Preferred header: `x-fsp-session-id`
- Body fallbacks: `session_id`, `metadata.session_id` (see `docs/CUSTOM_LLM_API_CONTRACT.md`)

## LiveAvatar Custom LLM API path (official)

Custom LLM wiring for LiveAvatar FULL Mode is **not** done through a visible HeyGen website UI. The provider flow is API-driven:

1. **Create a Custom LLM configuration** via the LiveAvatar **LLM Configurations API**, with the callback URL `https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions` (or your own `https://<vercel-domain>/v1/chat/completions` for other deployments).
2. Store the returned **`llm_configuration_id`** (FSP/ExpoWall env name: `LIVEAVATAR_LLM_CONFIGURATION_ID`).
3. **Create Session Token** (`POST /v1/sessions/token`) must include that `llm_configuration_id` together with `avatar_id`, `voice_id` / `context_id` (inside `avatar_persona`), `language`, `max_session_duration`, and `interactivity_type`.

LiveAvatar **context** (`context_id`) is for a minimal role/opening only. **Do not** put case facts, lab values, guardrails, or DeepSearch content there — the patient brain is **`POST /v1/chat/completions`** in this backend.

## HeyGen context vs FSP context (critical)

**LiveAvatar context must stay minimal** — e.g. a short role instruction such as “Du bist eine fiktive Patientin in einer FSP-Übung. Antworte nur auf Deutsch, kurz und patientenorientiert.”

**Do not** paste case facts, lab values, guardrails, hidden-fact policy, or DeepSearch links into LiveAvatar context records.

All real FSP/SLE simulation logic lives in **this backend**:

- `content/fsp-nrw-sle/` scenario YAML
- phase machine and hidden-fact release
- patient-phase lab blocking
- real-user medical safety exits
- transcript and session state (currently in-memory)

HeyGen provides avatar, STT/TTS, and turn transport; **our Custom LLM is the patient brain**.

## ExpoWall credential discovery (read-only)

Inspected **read-only**: the local ExpoWall checkout (`mcsq-expo-wall` sibling project) — **no files modified**.

ExpoWall uses `@heygen/liveavatar-web-sdk` and server routes under `/api/liveavatar/session/*`. Relevant env **names** (from `.env.example` and `src/lib/liveavatar/config.ts`):

| ExpoWall (`LIVEAVATAR_*`) | FSP prototype (canonical) | Notes |
| --- | --- | --- |
| `LIVEAVATAR_API_KEY` | `HEYGEN_API_KEY` | Server-only; session token minting |
| `LIVEAVATAR_AVATAR_ID` | `HEYGEN_LIVEAVATAR_AVATAR_ID` | Avatar selection |
| `LIVEAVATAR_VOICE_ID` | `HEYGEN_LIVEAVATAR_VOICE_ID` | Optional voice override |
| `LIVEAVATAR_CONTEXT_ID` | *(HeyGen-side only)* | Minimal HeyGen context record ID — **not** FSP case content |
| `LIVEAVATAR_LLM_CONFIGURATION_ID` | *(LiveAvatar API only)* | ID from LiveAvatar LLM Configurations API |
| `LIVEAVATAR_BASE_URL` | default `https://api.liveavatar.com` | API base |
| `LIVEAVATAR_LANGUAGE` | — | Default `de` in ExpoWall |
| `LIVEAVATAR_INTERACTIVITY_TYPE` | — | `PUSH_TO_TALK` or `CONVERSATIONAL` |
| `LIVEAVATAR_SANDBOX` | — | Sandbox sessions |
| `LIVEAVATAR_MAX_SESSION_SECONDS` | — | Session cap |
| `NEXT_PUBLIC_ERLEBE_WALBECK_AVATAR_ENABLED` | — | ExpoWall UI gate only |

Local ExpoWall `.env.local` (read-only check, **values not copied or printed**) had non-empty values for: `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID`, `LIVEAVATAR_VOICE_ID`, `LIVEAVATAR_CONTEXT_ID`, `LIVEAVATAR_LANGUAGE`, `LIVEAVATAR_INTERACTIVITY_TYPE`, `LIVEAVATAR_SANDBOX`, `LIVEAVATAR_MAX_SESSION_SECONDS`, `NEXT_PUBLIC_ERLEBE_WALBECK_AVATAR_ENABLED`. `LIVEAVATAR_LLM_CONFIGURATION_ID` was **not** set locally.

This repo accepts `LIVEAVATAR_*` as **optional fallbacks** when running locally so you can reuse ExpoWall credentials without duplicating secrets into new variable names. On Vercel, prefer explicit `HEYGEN_*` and `FSP_PUBLIC_BASE_URL`.

## Environment setup

1. Copy `.env.example` → `.env.local` (gitignored).
2. Never commit `.env.local` or real secret values.
3. For Vercel, set project env vars in the dashboard or CLI (see below).

Required for **bridge configuration check** (status endpoint reports `configured: true`):

- `HEYGEN_API_KEY` (or local fallback `LIVEAVATAR_API_KEY`)
- `HEYGEN_LIVEAVATAR_AVATAR_ID` (or `LIVEAVATAR_AVATAR_ID`)
- `FSP_PUBLIC_BASE_URL` (or rely on `VERCEL_URL` on Vercel)

LiveAvatar **session-token minting** and WebRTC runtime remain **not implemented** — `POST /api/integrations/heygen/session-token` returns 503 `not_configured` until a future PR verifies the provider contract.

## Vercel deployment

Production is deployed at **https://fsp-liveavatar-sle-prototype.vercel.app**. Public smoke tests (2026-06-25): `GET /api/health` returns `status: ok`; `POST /v1/chat/completions` returns OpenAI-compatible `chat.completion` with `x_fsp.mock: true`.

For new environments or forks, import `alexv-mc2/fsp-liveavatar-sle-prototype` in [Vercel Dashboard](https://vercel.com/new) (Next.js preset) and set:

- `FSP_PUBLIC_BASE_URL` = `https://<your-production-domain>` *(optional on Vercel; use for a fixed callback URL)*
- `HEYGEN_API_KEY` = *(from secure store)*
- `HEYGEN_LIVEAVATAR_AVATAR_ID` = *(from secure store)*
- Optional: `HEYGEN_LIVEAVATAR_VOICE_ID`

Smoke-test (replace domain as needed):

```bash
curl https://fsp-liveavatar-sle-prototype.vercel.app/api/health
curl -X POST https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Guten Tag"}]}'
```

CLI equivalent (after `npx vercel login`):

```bash
npx vercel link
npx vercel env add FSP_PUBLIC_BASE_URL production
npx vercel env add HEYGEN_API_KEY production
npx vercel env add HEYGEN_LIVEAVATAR_AVATAR_ID production
npx vercel --prod
```

**Do not** paste secrets into chat, commits, or CI logs.

## Manual HeyGen / LiveAvatar setup sequence

1. **Choose avatar** — use current LiveAvatar avatar ID (same as `HEYGEN_LIVEAVATAR_AVATAR_ID` / ExpoWall `LIVEAVATAR_AVATAR_ID`).
2. **Create Custom LLM via API** — call LiveAvatar LLM Configurations API with URL `https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions`; save `llm_configuration_id`. *(Not available as a visible HeyGen website setting.)*
3. **Minimal LiveAvatar context** — `context_id` carries short German patient role/opening only; **no** case YAML, links, or lab content. Full FSP logic stays in `/v1/chat/completions`.
4. **Mint session token** — `POST /v1/sessions/token` with `llm_configuration_id`, `avatar_id`, persona `context_id`/`voice_id`, `language`, `max_session_duration`, `interactivity_type`.
5. **German patient opening** — start session; verify opening complaint matches backend (`POST /api/sessions` + first completion or HeyGen-driven turn).
6. **Session continuity** — if HeyGen sends metadata, confirm `x-fsp-session-id` header (or body `session_id`) keeps the same FSP session across turns (`x_fsp.correlation` in response).
7. **Patient-phase lab blocking** — ask for ANA/C3 during anamnesis; patient must refuse numeric lab values.
8. **Real-user medical safety** — ask for diagnosis/treatment; session should exit safely per guardrails.
9. **Push-to-Talk** — verify turn boundaries and interruption behavior on HeyGen side (backend PTT audio **not implemented** here).
10. **Transcript events** — compare HeyGen transcript with `x_fsp.session.transcriptTurns` during mock/spike.
11. **Stop session** — explicit stop on both client and provider; confirm no orphaned sessions.
12. **Provider deletion/retention** — document HeyGen data retention and deletion guarantees for production compliance.

## What remains mocked / manual

| Item | Status |
| --- | --- |
| Custom LLM patient logic | Mock deterministic keyword simulation |
| Avatar video / WebRTC | Mock UI only |
| HeyGen session token API | Fail-closed 503 |
| Push-to-Talk audio | Text substitute only |
| Streaming (`stream: true`) | Rejected 400 |
| Session persistence | In-memory single process |
| Supabase transcripts | Deferred |

## Config check endpoints

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/integrations/heygen/status
```

`heygen_integration.bridge` reports deployment target, Custom LLM URL, alias presence flags (booleans only), and Supabase deferral note.

## Privacy and secret safety

- No API keys in source control.
- `.env.local` remains gitignored; `.env.example` contains names only.
- Status/health endpoints expose **variable names and boolean presence**, never secret values.
- ExpoWall was inspected read-only; sibling repos were not modified.

## Next persistence slice (after bridge works)

1. Deploy stable Vercel production URL — **done:** `https://fsp-liveavatar-sle-prototype.vercel.app`. Wire LiveAvatar Custom LLM (next slice).
2. Run manual HeyGen checklist above.
3. Add Supabase/Postgres for sessions, transcripts, revealed facts, feedback.
4. Implement verified LiveAvatar session-token minting aligned with ExpoWall `POST /v1/sessions/token` pattern.
