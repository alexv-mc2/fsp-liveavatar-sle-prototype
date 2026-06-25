# FSP SLE Trainer – standalone prototype

Local architecture skeleton for a German Fachsprachprüfung training avatar with one fictional case: **Systemischer Lupus erythematodes (SLE)**.

The project is independent from ExpoWall, brAIn, ToolDii, and all other existing repositories. It does not claim official approval by Ärztekammer Nordrhein and does not provide medical advice or real-patient diagnosis.

## Run locally

Prerequisite: Node.js 20.9 or newer (Node 22 recommended).

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Implemented in this slice

- Next.js App Router + TypeScript
- content-first one-case package under `content/fsp-nrw-sle/`
- Zod-validated YAML scenario (`RECONCILED_V1`) with provenance labels `[PDF]`, `[VERIFIED]`, `[PROTOTYPE]`, `[INFERENCE]`, `[REVIEW]`
- in-memory sessions and transcript turns
- deterministic hidden-fact release policy
- basic phase machine
- real-user medical-advice and PII guardrails
- patient-phase laboratory-value blocking
- `GET /api/health`
- session create, inspect, phase transition, reset, and feedback routes
- non-streaming `POST /v1/chat/completions`
- compatibility `POST /chat/completions`
- German start/consent/simulation UI
- mock avatar and text-based Push-to-Talk substitute
- documentation, laboratory, handover, and feedback placeholders
- nine focused Vitest tests (opening, hidden facts, lab/classification blocking, safety, reset, OpenAI shape)
- HeyGen FULL Mode **contract spike** (fail-closed placeholder routes; not connected)

## API examples

Create a session:

```bash
curl -X POST http://localhost:3000/api/sessions
```

Call the mock OpenAI-compatible endpoint:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'x-fsp-session-id: SESSION_ID' \
  -d '{
    "model": "fsp-sle-deterministic-mock-v0",
    "messages": [{"role": "user", "content": "Seit wann bestehen die Beschwerden?"}]
  }'
```

The standard OpenAI-like fields are returned together with an `x_fsp` extension containing mock session state. Streaming is intentionally not implemented yet.

## Deliberately mocked

- avatar video, voice, STT, TTS, and WebRTC
- Push-to-Talk audio behavior
- examiner/Oberarzt interaction
- documentation persistence and scoring
- lab-call dialogue
- language-quality scoring
- clinically validated feedback

All case content uses provenance labels; physician/FSP trainer sign-off remains pending for `[REVIEW]` items.

## HeyGen integration (contract spike only)

**HeyGen is not connected.** The app uses a mock avatar and text Push-to-Talk substitute.

Contract documentation: `docs/HEYGEN_INTEGRATION_CONTRACT.md`

Placeholder endpoints (fail-closed without credentials):

```bash
curl http://localhost:3000/api/integrations/heygen/status
curl -X POST http://localhost:3000/api/integrations/heygen/session-token \
  -H 'content-type: application/json' \
  -d '{"fsp_session_id":"SESSION_UUID"}'
```

Future local spike requires server env vars only (never commit values):

- `HEYGEN_API_KEY`
- `HEYGEN_LIVEAVATAR_AVATAR_ID`
- `FSP_PUBLIC_BASE_URL` (HTTPS URL HeyGen uses for Custom LLM callbacks)

Custom LLM target: `POST /v1/chat/completions` with header `x-fsp-session-id`.

## Privacy constraints

- no raw-audio storage
- no authentication or production database
- no real patient data
- no API keys in source
- local in-memory session state only
