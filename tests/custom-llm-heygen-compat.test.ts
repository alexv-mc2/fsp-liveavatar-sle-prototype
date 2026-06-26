import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import {
  describeCustomLlmRequestShape,
  HEYGEN_VAD_NOOP_RESPONSE_DE,
  messageContentToText,
  resolveLatestUserMessage,
} from "@/server/integrations/customLlm/messageExtraction";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";

const scenario = loadScenario();
let store: InMemorySessionStore;

beforeEach(() => {
  store = new InMemorySessionStore();
  sessionStore.clear();
});

async function postChat(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return chatRoutePost(
    new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("Custom LLM message extraction", () => {
  it("extracts string user content", () => {
    const resolution = resolveLatestUserMessage([
      { role: "system", content: "ctx" },
      { role: "user", content: "Seit wann?" },
    ]);
    expect(resolution).toEqual({ kind: "text", text: "Seit wann?", index: 1 });
  });

  it("extracts multipart text and input_text content", () => {
    expect(
      messageContentToText([
        { type: "input_text", input_text: "Hallo" },
        { type: "text", text: " Welt" },
      ]),
    ).toBe("Hallo\n Welt");

    const resolution = resolveLatestUserMessage([
      {
        role: "user",
        content: [{ type: "input_text", input_text: "Haben Sie Fieber?" }],
      },
    ]);
    expect(resolution.kind).toBe("text");
    if (resolution.kind === "text") {
      expect(resolution.text).toBe("Haben Sie Fieber?");
    }
  });

  it("normalizes role casing", () => {
    const resolution = resolveLatestUserMessage([
      { role: "User", content: "Guten Tag" },
    ] as never);
    expect(resolution.kind).toBe("text");
  });

  it("describes request shape without echoing message text", () => {
    const shape = describeCustomLlmRequestShape({
      messages: [
        { role: "system", content: "secret-context" },
        { role: "user", content: "   " },
      ],
      metadata: { session_id: "11111111-1111-4111-8111-111111111111" },
      stream: false,
    });

    expect(shape.message_count).toBe(2);
    expect(shape.latest_user_content_kind).toBe("string");
    expect(shape.latest_user_text_len).toBe(0);
    expect(shape.metadata_keys).toContain("session_id");
    expect(JSON.stringify(shape)).not.toContain("secret-context");
  });

  it("tolerates malformed raw messages before schema validation", () => {
    const shape = describeCustomLlmRequestShape({
      messages: [null, { role: "user", content: [{ text: 123 }] }, "bad-entry"],
    });

    expect(shape.message_count).toBe(3);
    expect(shape.roles).toEqual(["?", "user", "?"]);
    expect(shape.latest_user_text_len).toBe(0);
  });
});

describe("Custom LLM HeyGen VAD no-op compatibility", () => {
  it("returns 200 OpenAI shape for empty user string instead of 400", async () => {
    const response = await postChat({
      messages: [{ role: "user", content: "   " }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-fsp-session-id")).toBeNull();
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.role).toBe("assistant");
    expect(typeof body.choices[0].message.content).toBe("string");
    expect(body.choices[0].message.content).toBe(HEYGEN_VAD_NOOP_RESPONSE_DE);
    expect(body.x_fsp.vad_noop).toBe(true);
    expect(body.x_fsp.vad_noop_reason).toBe("empty_content");
  });

  it("returns 200 OpenAI shape when no user role is present", async () => {
    const response = await postChat({
      messages: [{ role: "system", content: "context only" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.choices[0].message.content).toBe(HEYGEN_VAD_NOOP_RESPONSE_DE);
    expect(body.x_fsp.vad_noop_reason).toBe("missing_user");
  });

  it("returns 200 for null user content and empty multipart arrays", async () => {
    const nullResponse = await postChat({
      messages: [{ role: "assistant", content: "..." }, { role: "user", content: null }],
    });
    const nullBody = await nullResponse.json();
    expect(nullResponse.status).toBe(200);
    expect(nullBody.x_fsp.vad_noop).toBe(true);

    const arrayResponse = await postChat({
      messages: [{ role: "user", content: [{ type: "text", text: "" }] }],
    });
    const arrayBody = await arrayResponse.json();
    expect(arrayResponse.status).toBe(200);
    expect(arrayBody.x_fsp.vad_noop_reason).toBe("empty_content");
  });

  it("does not mutate session state on VAD no-op", async () => {
    const session = store.create(scenario);
    const beforeTurns = store.require(session.id).transcriptTurns.length;

    const response = processChatCompletion(
      {
        messages: [{ role: "user", content: "" }],
      },
      { store, scenario, headerSessionId: session.id },
    );

    expect(response.x_fsp.vad_noop).toBe(true);
    expect(store.require(session.id).transcriptTurns.length).toBe(beforeTurns);
    expect(store.require(session.id).revealedFactIds.size).toBe(0);
  });

  it("still processes non-empty user messages through scenario logic", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat(
      {
        messages: [{ role: "user", content: "Haben Sie ungewollt abgenommen?" }],
      },
      { "x-fsp-session-id": session.id },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.vad_noop).toBeUndefined();
    expect(body.choices[0].message.content).toContain("drei Kilo");
  });

  it("accepts HeyGen-like metadata envelope with empty latest user turn", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat({
      metadata: {
        session_id: session.id,
        heygen_session_id: "provider-ignored",
        source: "heygen_liveavatar",
      },
      messages: [
        { role: "system", content: "You are a patient." },
        { role: "assistant", content: "Guten Tag." },
        { role: "user", content: "" },
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.vad_noop).toBe(true);
    expect(body.x_fsp.session_persisted).toBe(true);
    expect(body.x_fsp.session_id).toBe(session.id);
    expect(response.headers.get("x-fsp-session-id")).toBe(session.id);
    expect(JSON.stringify(body)).not.toContain("provider-ignored");
  });

  it("omits reusable session header when VAD no-op has no persisted session", async () => {
    const response = await postChat(
      {
        messages: [{ role: "user", content: "" }],
      },
      { "x-fsp-session-id": "22222222-2222-4222-8222-222222222222" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.vad_noop).toBe(true);
    expect(body.x_fsp.session_persisted).toBe(false);
    expect(response.headers.get("x-fsp-session-id")).toBeNull();
  });
});

describe("Custom LLM validation still fails closed", () => {
  it("returns 400 when messages array is missing", async () => {
    const response = await postChat({});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });
});
