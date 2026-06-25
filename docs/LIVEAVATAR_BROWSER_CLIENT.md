# LiveAvatar browser client (first slice)

**Status:** minimal German FSP SLE practice UI at `/liveavatar` using `@heygen/liveavatar-web-sdk`.

Production bridge: `https://fsp-liveavatar-sle-prototype.vercel.app`

## What the client does

1. `POST /api/sessions` — creates an in-memory FSP session (`fsp_session_id`).
2. `POST /api/integrations/heygen/session-token` with `{ "fsp_session_id": "<uuid>" }` — server mints LiveAvatar token (no API key in browser).
3. `@heygen/liveavatar-web-sdk` `LiveAvatarSession` — WebRTC connect, video attach, Push-to-Talk via `voiceChat`.
4. `session.stop()` on **Session beenden** or unmount — client-side cleanup (no server stop route in this slice).

Custom LLM / case brain remains on **`POST /v1/chat/completions`** via HeyGen `llm_configuration_id`. Do **not** re-add `context_id` or `voice_id` in this slice.

## Local run

Prerequisite: Node.js 20.9+ (22 recommended).

```bash
npm ci
npm run dev
```

Open `http://localhost:3000/liveavatar`.

### Local HeyGen env (optional)

Without Vercel secrets, token mint returns **503 not_configured**. For a full browser test locally, set in `.env.local` (never commit):

| Variable | Required for token |
| --- | --- |
| `HEYGEN_API_KEY` | yes |
| `HEYGEN_LIVEAVATAR_AVATAR_ID` | yes |
| `HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID` | yes |
| `FSP_PUBLIC_BASE_URL` | yes (e.g. `http://localhost:3000` for local Custom LLM callbacks) |
| `LIVEAVATAR_SANDBOX` | recommended `false` for stable tokens |
| `LIVEAVATAR_MAX_SESSION_SECONDS` | recommended `300` when sandbox is false |

**Do not set** `HEYGEN_LIVEAVATAR_VOICE_ID` or `HEYGEN_LIVEAVATAR_CONTEXT_ID` for this slice.

Restart `npm run dev` after env changes.

## Production run

1. Deploy with working Vercel env (see `docs/LIVEAVATAR_SESSION_TOKEN.md`).
2. Confirm `GET /api/health` → `session_token_configured: true`.
3. Open `https://fsp-liveavatar-sle-prototype.vercel.app/liveavatar`.
4. **FSP-Sitzung erstellen** → **LiveAvatar verbinden** → allow microphone → hold **Push-to-Talk halten** to speak.

## Browser test checklist

- [ ] Bridge status shows **bereit** on production.
- [ ] FSP session ID appears after create.
- [ ] LiveAvatar connect reaches **Verbunden** and video placeholder clears.
- [ ] Push-to-Talk requests microphone permission once.
- [ ] **Session beenden** returns to idle without console errors.
- [ ] Network tab: no `HEYGEN_API_KEY` or provider secrets in requests.

## Known limitations (current slice)

| Limitation | Notes |
| --- | --- |
| **No `voice_id` in token mint** | Tokens mint without `HEYGEN_LIVEAVATAR_VOICE_ID`. Avatar face may render; ElevenLabs voice binding is deferred until a valid LiveAvatar voice UUID is confirmed. |
| **No server session stop** | Only SDK `stop()` in browser; provider session lifecycle on tab close is best-effort. |
| **`x-fsp-session-id` correlation** | Documented on token response; LiveAvatar→Custom LLM must pass FSP session id via provider metadata (not fully wired in token body). |
| **In-memory FSP sessions** | Server restart loses sessions; token mint returns 404 for unknown `fsp_session_id`. |
| **No scoring / phases UI** | LiveAvatar page is connect + PTT only; full simulation remains at `/simulation`. |

## Source layout

| Path | Role |
| --- | --- |
| `src/lib/liveavatar/clientApi.ts` | Token/status fetch + response parsing (testable) |
| `src/hooks/useFspLiveAvatarSession.ts` | SDK session lifecycle |
| `src/components/LiveAvatarPracticePanel.tsx` | German UI |
| `src/app/liveavatar/page.tsx` | Route |
| `tests/liveavatar-client.test.ts` | API contract tests (no real media) |

## Validation

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```
