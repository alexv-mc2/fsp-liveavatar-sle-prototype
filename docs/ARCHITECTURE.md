# Architecture – FSP LiveAvatar SLE Prototype

## Scope

This repository contains one standalone fictional SLE case. It is not part of ExpoWall, brAIn, ToolDii, or another MC² repository. It is not a course platform, clinical decision-support system, or officially approved examination product.

## Current request flow

```text
Next.js frontend
  -> POST /api/sessions
  -> text-based PTT mock
  -> POST /v1/chat/completions (Custom LLM; see docs/CUSTOM_LLM_API_CONTRACT.md)
  -> session correlation (header / body / metadata)
  -> guardrails
  -> deterministic keyword/intent matching
  -> hidden-fact policy
  -> response validator
  -> in-memory session/transcript state
```

The compatibility route `POST /chat/completions` uses the same handler. Streaming is deliberately rejected in v0 with an OpenAI-style error.

## Ownership boundaries

### Frontend

- consent and no-real-data warning
- mock avatar surface
- phase navigation
- text PTT substitute
- transcript rendering
- documentation, lab, handover, and feedback placeholders

### Backend

- scenario schema validation
- phase state
- hidden-fact release events
- safety exits for real-user medical requests
- patient-phase lab blocking
- transcript state
- non-official checklist coverage

### Content

All case-seeded medical content is marked `UNVERIFIED_FROM_PDF`. The source register separates PDF-derived content, official-context items requiring recheck, and future medical guideline sources.

## In-memory limitation

The global in-memory store is suitable only for one local Node process. It survives route-bundle boundaries and development hot reloads in that process, but it is not a production persistence strategy and must not be treated as durable or multi-instance safe.

**Supabase/Postgres** for sessions, transcripts, revealed facts, and feedback is the **next slice after the HeyGen bridge works**. See `docs/VERCEL_HEYGEN_BRIDGE.md`.

## Deployment (Vercel)

**Vercel** hosts the Next.js app and API routes for this prototype. Production Custom LLM: `https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions` (generic form: `https://<vercel-domain>/v1/chat/completions`). GitHub Pages and Codespaces are not deployment targets.

HeyGen-side Context must stay minimal (role instruction only); FSP case content, guardrails, and hidden-fact policy live in this backend (`content/fsp-nrw-sle/` and server routes).

## HeyGen contract spike (added; not connected)

FULL Mode integration is **documented but not implemented**. See:

- `docs/HEYGEN_INTEGRATION_CONTRACT.md`
- `GET /api/integrations/heygen/status`
- `POST /api/integrations/heygen/session-token` (fail-closed 503)

Before connecting LiveAvatar FULL Mode, verify against exact credentials and current provider documentation:

1. backend session-token contract and secret handling (`HEYGEN_API_KEY` server-only)
2. Custom LLM URL composition (`/v1/chat/completions` versus `/chat/completions`)
3. request metadata and `x-fsp-session-id` for stable FSP session correlation
4. streaming/SSE expectations and timeout behavior (currently rejected)
5. Push-to-Talk start, stop, interruption, and turn-finalization semantics
6. transcript event ordering, duplication, and reconciliation
7. explicit stop-session behavior
8. provider session-event deletion and retention guarantees
9. German STT/TTS pronunciation for the glossary

`HeyGenAvatarShell.tsx` is the UI integration boundary and remains mock-only. `src/integrations/heygen/contracts.ts` and `src/server/integrations/heygen/*` define the provider-neutral adapter surface without assuming undocumented fields.

## DeepSearch and physician-review boundary

The following remain blocked from canonical use:

- final SLE symptom set and chronology
- exact laboratory values and interpretation
- classification/diagnostic wording
- treatment and dosage statements
- admission versus ambulatory recommendations
- pregnancy/OCP/APS content
- commission-style answers
- clinically weighted scoring
