# Custom LLM API contract (OpenAI-compatible)

**Status:** implemented for mock deterministic engine; HeyGen LiveAvatar **not connected**.

Endpoints:

- `POST /v1/chat/completions` (primary)
- `POST /chat/completions` (compatibility alias)

Both routes share `handleChatCompletionPost` in `src/server/routes/chatCompletions.ts`.

## Request

### Headers

| Header | Required | Purpose |
|---|---|---|
| `content-type: application/json` | yes | JSON body |
| `x-fsp-session-id` | recommended for HeyGen | FSP session UUID; **highest priority** correlation source |

### Body (OpenAI-compatible subset)

```json
{
  "model": "optional-string",
  "messages": [{ "role": "user", "content": "German patient question" }],
  "stream": false,
  "session_id": "optional-fsp-uuid",
  "metadata": {
    "session_id": "optional-fsp-uuid",
    "fsp_phase": "optional-phase-hint-ignored-by-engine",
    "case_id": "fsp-nrw-sle",
    "source": "heygen_liveavatar"
  }
}
```

### Session correlation precedence

1. `x-fsp-session-id` header
2. body `session_id`
3. body `metadata.session_id`
4. if none: **new in-memory session created** (`source: created`) — OK for curl tests; HeyGen wiring should always pass (1)–(3)

Invalid UUID in an explicit correlation field → **400** `invalid_session_id`.

Unknown `metadata` keys (e.g. provider payloads) are **ignored** and never persisted. Ignored key names are echoed in `x_fsp.correlation.ignored_metadata_keys`.

### Validation errors (400)

| Code | Condition |
|---|---|
| `validation_error` | Zod schema failure (e.g. empty `messages` array) |
| `invalid_json` | Malformed JSON |
| `missing_user_message` | No `user` role message |
| `empty_user_message` | Latest user message is whitespace-only |
| `invalid_session_id` | Correlation field present but not a UUID |

### Streaming

When `stream: true`, the handler runs the same FSP/SLE scenario logic as non-streaming requests and returns **200** with `Content-Type: text/event-stream` (OpenAI-compatible SSE):

1. `chat.completion.chunk` with `delta.role: assistant` and empty `delta.content`
2. `chat.completion.chunk` with `delta.content` set to the full assistant text
3. `chat.completion.chunk` with `finish_reason: stop`
4. `data: [DONE]`

VAD no-op (empty/missing user content) streams the German filler phrase instead of returning 400.

Non-streaming (`stream: false` or omitted) continues to return JSON `chat.completion` with `x_fsp` extension.

## Response (200, non-streaming)

OpenAI-shaped JSON plus FSP extension:

```json
{
  "id": "chatcmpl-fsp-…",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "fsp-sle-deterministic-mock-v0",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "…" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2 },
  "x_fsp": {
    "mock": true,
    "session_id": "uuid",
    "phase": "anamnesis_active",
    "revealed_fact_ids": [],
    "blocked_fact_ids": [],
    "safety_flag": null,
    "correlation": {
      "session_id_source": "header",
      "ignored_metadata_keys": ["heygen_session_id"]
    },
    "session": { }
  }
}
```

Response header: `x-fsp-session-id: <uuid>` (always set).

## Safety and privacy

- Real-user medical advice triggers guardrail exit (not role-play).
- Patient-phase lab/classification leaks blocked by response validator.
- No provider metadata blobs stored in session state.
- No API keys or HeyGen tokens in request/response bodies.

## Related

- `docs/HEYGEN_INTEGRATION_CONTRACT.md` — LiveAvatar FULL Mode boundary
- `src/server/integrations/customLlm/correlation.ts` — correlation resolver
- `tests/custom-llm-compatibility.test.ts` — fixture tests
