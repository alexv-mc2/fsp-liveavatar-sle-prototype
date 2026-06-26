# LiveAvatar end-to-end diagnostics

Debug runs are enabled on `/liveavatar?fsp_debug=1` in **Preview** and **local dev** by default.
On **Production**, set `FSP_LIVEAVATAR_DIAGNOSTICS=1` (unless explicitly disabled with `=0`).

## Persistence model

| Layer | Role |
| --- | --- |
| **Vercel structured logs** | Primary durable source. Every event is mirrored as JSON on stdout: `[fsp-diag] {"diagnostic_run_id":"…","phase":"…",…}` |
| **In-memory run cache** | Secondary. Same serverless instance can serve `GET /api/debug/liveavatar/runs/{id}` |
| **Client local buffer** | Always kept in browser for export even when server cache misses (cold instance) |

Query production logs:

```bash
vercel logs fsp-liveavatar-sle-prototype.vercel.app --filter 'diagnostic_run_id=<runId>'
```

## How Alex runs one test

1. Open `https://fsp-liveavatar-sle-prototype.vercel.app/liveavatar?fsp_debug=1`
2. Note the **diagnostic_run_id** in the banner / debug panel
3. Create FSP session → Connect LiveAvatar → use PTT or conversational controls
4. End session when done
5. Click **JSON kopieren** or **JSON herunterladen** in the debug panel
6. Paste the JSON (or attach the file) instead of screenshots

## Custom LLM correlation (HeyGen cannot pass diagnostic_run_id)

Correlation order for `/v1/chat/completions`:

1. `fsp_session_id` from HeyGen request body/header matched to run context
2. `provider_session_id` from token mint matched to run context
3. All **active** diagnostic runs (60-minute window) — may attach to multiple runs
4. Uncorrelated callbacks logged as `custom_llm_callback_uncorrelated` with `diagnostic_run_id: "uncorrelated"`

**Cannot correlate reliably when:**

- HeyGen omits `session_id` and multiple debug runs overlap
- Custom LLM hits a cold serverless instance with no in-memory run (logs still durable via stdout)
- HeyGen never calls Custom LLM (classified as `NO_LLM_CALLBACK`)

## Breakpoint classifications

| Code | Meaning |
| --- | --- |
| `TOKEN_FAIL` | Session token mint failed |
| `SDK_START_FAIL` | SDK `start()` failed |
| `VIDEO_FAIL` | No stream after SDK start |
| `MIC_FAIL` | Microphone permission denied |
| `NO_OUTBOUND_AUDIO` | RTP bytesSent stays 0 after user spoke |
| `NO_LLM_CALLBACK` | No Custom LLM traffic during run |
| `LLM_400` | Custom LLM HTTP 4xx |
| `LLM_200_NO_CONTENT` | Custom LLM 200 without assistant text |
| `LLM_200_CONTENT_NO_AUDIO` | LLM text but no avatar speak event |
| `PLAYBACK_MUTED` | Remote video muted |
| `AVATAR_RESPONDED` | `AVATAR_SPEAK_STARTED` observed |
| `UNKNOWN` | Inconclusive / run still open |

## Greeting probe

After successful SDK start, debug mode calls `LiveAvatarSession.repeat()` with a neutral
German probe phrase if the SDK exposes the method. Otherwise logs `GREETING_UNSUPPORTED`
with API evidence (no fake speech).

## Secret / PHI hygiene

Diagnostic payloads truncate long strings, redact JWTs and secret-like keys, and never log
API keys or session tokens.
