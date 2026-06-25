# HeyGen LiveAvatar FULL Mode – integration contract (spike)

**Status:** contract only — **HeyGen is not connected** in this repository. No SDK calls, no API keys, no real session tokens.

This document defines how a future real HeyGen spike will attach to the existing FSP mock backend without changing medical content or sibling repositories.

## Scope boundary

| In scope (this spike) | Out of scope |
|---|---|
| Env var names (placeholders) | Real HeyGen SDK / REST calls |
| Fail-closed session-token route | Public deployment |
| Custom LLM URL + correlation contract | Auth, DB, vector DB, audio storage |
| PTT / streaming / stop-session TODOs | UI redesign or new cases |
| Privacy and failure-mode notes | Medical content changes |

## Required server environment variables (future)

| Variable | Purpose |
|---|---|
| `HEYGEN_API_KEY` | Server-only provider API key for token minting |
| `HEYGEN_LIVEAVATAR_AVATAR_ID` | Target avatar id for FULL Mode |
| `HEYGEN_LIVEAVATAR_VOICE_ID` | Optional voice override (verify in provider docs) |
| `FSP_PUBLIC_BASE_URL` | Public HTTPS base URL HeyGen uses to call our Custom LLM |

Never commit values. Never expose `HEYGEN_API_KEY` to the browser.

## Server-side token boundary

```text
Browser (future)
  -> POST /api/integrations/heygen/session-token { fsp_session_id }
  -> Next.js server validates FSP session exists
  -> [future] server calls HeyGen with HEYGEN_API_KEY
  -> returns short-lived provider session token to browser

Current spike:
  -> always 503 + { status: "not_configured", missing_env: [...] }
  -> no provider token ever returned
```

Implementation files:

- `src/server/integrations/heygen/env.ts`
- `src/server/integrations/heygen/sessionToken.ts`
- `src/server/routes/heygen.ts`
- `src/app/api/integrations/heygen/status/route.ts`
- `src/app/api/integrations/heygen/session-token/route.ts`

## Custom LLM contract

See **`docs/CUSTOM_LLM_API_CONTRACT.md`** for the supported request/response shape, correlation precedence, validation errors, and `x_fsp.correlation` extension.

HeyGen FULL Mode should call our existing OpenAI-compatible endpoint:

| Item | Value |
|---|---|
| Primary URL | `{FSP_PUBLIC_BASE_URL}/v1/chat/completions` |
| Compatibility URL | `{FSP_PUBLIC_BASE_URL}/chat/completions` |
| Method | `POST` |
| Streaming | **Not implemented** (`stream: true` → 400). SSE contract TODO. |
| Correlation header | `x-fsp-session-id: <fsp uuid>` |
| Correlation body fields | `session_id`, `metadata.session_id` |
| Response | OpenAI `chat.completion` + `x_fsp` extension (mock deterministic engine today) |

The handler resolves session id in this order: header → body `session_id` → body `metadata.session_id`. Invalid UUIDs return **400**. Unknown metadata keys are ignored (see Custom LLM contract doc). If absent, a new in-memory session is created (acceptable for curl tests; **not** for production HeyGen without explicit correlation).

## Push-to-Talk assumptions (TODO)

- User holds PTT → browser captures audio → HeyGen STT → Custom LLM user message.
- Release PTT → finalize user turn → await assistant text → HeyGen TTS playback.
- Interruption / barge-in semantics must be verified against current HeyGen FULL Mode docs.
- Server remains source of truth for hidden facts, phases, and guardrails.

## Transcript / session events (TODO)

Expected provider events (adapter surface in `src/integrations/heygen/contracts.ts`):

- `transcript.partial`, `transcript.final`
- `avatar.started_speaking`, `avatar.stopped_speaking`
- `session.closed`, `session.error`

Reconciliation rules still open:

1. Deduplicate partial vs final transcripts before appending to FSP transcript.
2. Map provider timestamps to FSP `TranscriptTurn` entries without overwriting server state.
3. On FSP reset/end, call provider `stopSession()` then verify event deletion policy.

## Stop session / delete events (TODO)

On simulation reset, phase end, or unmount:

1. Stop HeyGen session (`stopSession`).
2. Confirm whether HeyGen deletes session events automatically or requires an explicit API call (`deleteSessionEvents`).
3. Do not retain raw audio in this prototype.

## Privacy / retention

- No raw-audio storage in repo or default server paths.
- In-memory FSP transcripts only; lost on process restart.
- Provider-side retention must be verified with HeyGen account/docs before production.
- PII guardrails in chat handler remain active for Custom LLM traffic.

## Failure modes

| Code | Meaning |
|---|---|
| `not_configured` | Missing env vars or spike not implemented |
| `token_mint_failed` | Future: HeyGen token API error |
| `session_start_failed` | Future: FULL Mode start error |
| `custom_llm_unreachable` | HeyGen cannot reach `FSP_PUBLIC_BASE_URL` |
| `custom_llm_timeout` | LLM round-trip too slow for avatar UX |
| `session_correlation_missing` | No `x-fsp-session-id` / body session id |
| `streaming_not_supported` | `stream: true` rejected (current behavior) |
| `ptt_not_supported` | Audio path not wired |
| `provider_event_delete_unverified` | Retention/deletion not confirmed |

## Open questions for real HeyGen validation

1. Exact FULL Mode token API path and response shape (2026 docs).
2. Whether Custom LLM supports metadata passthrough on every turn.
3. SSE/streaming requirement vs non-streaming latency budget.
4. PTT start/stop API on web vs native SDK.
5. Session event deletion guarantees and GDPR-relevant retention.
6. German STT/TTS quality for glossary terms in `11_PRONUNCIATION_GLOSSARY_DE.md`.
7. Whether HeyGen requires a publicly reachable URL (ngrok/cloud) for local dev.

## Local next steps (future real spike)

1. Obtain HeyGen account + FULL Mode docs + avatar id.
2. Set env vars locally (`.env.local`, not committed).
3. Expose `FSP_PUBLIC_BASE_URL` via ngrok or staging HTTPS.
4. Implement real token minting in `sessionToken.ts` behind config gate.
5. Wire `HeyGenAvatarShell.tsx` to request token and start FULL Mode.
6. Verify `x-fsp-session-id` correlation on every Custom LLM call.
7. Test stop/reset deletes provider session events per privacy contract.

## Related files

- `docs/ARCHITECTURE.md` – system flow
- `src/integrations/heygen/contracts.ts` – shared types/constants
- `src/components/HeyGenAvatarShell.tsx` – UI boundary (still mock)
- `src/server/routes/chatCompletions.ts` – Custom LLM handler
