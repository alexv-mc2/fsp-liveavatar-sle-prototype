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
- Zod-validated YAML scenario marked `UNVERIFIED_FROM_PDF`
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
- five focused Vitest tests

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

## Waiting for DeepSearch and physician review

All disease-specific facts, laboratory values, diagnostic wording, differential diagnoses, treatment details, and clinical scoring weights. The PDF seed is not treated as an authoritative source.

## Waiting for the HeyGen contract spike

FULL Mode token creation, Custom LLM request metadata, exact URL composition, streaming, PTT semantics, transcript events, stop-session behavior, and provider-side event deletion. See `docs/ARCHITECTURE.md` and `src/components/HeyGenAvatarShell.tsx`.

## Privacy constraints

- no raw-audio storage
- no authentication or production database
- no real patient data
- no API keys in source
- local in-memory session state only
