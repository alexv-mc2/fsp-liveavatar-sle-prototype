import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatCompatPost } from "@/app/chat/completions/route";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import {
  buildOpenAiStreamingChunks,
  encodeOpenAiStreamingBody,
} from "@/server/integrations/customLlm/streamingResponse";
import { HEYGEN_VAD_NOOP_RESPONSE_DE } from "@/server/integrations/customLlm/messageExtraction";
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

function parseSseDataEvents(body: string): unknown[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      const payload = line.slice("data: ".length).trim();
      if (payload === "[DONE]") {
        return payload;
      }
      return JSON.parse(payload) as unknown;
    });
}

describe("Custom LLM OpenAI streaming (stream:true)", () => {
  it("returns text/event-stream with role, content, stop, and [DONE] for real user message", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat(
      {
        stream: true,
        messages: [{ role: "user", content: "Haben Sie ungewollt abgenommen?" }],
      },
      { "x-fsp-session-id": session.id },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(
      /text\/event-stream/i,
    );
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("connection")).toBe("keep-alive");
    expect(response.headers.get("x-fsp-session-id")).toBe(session.id);

    const raw = await response.text();
    const events = parseSseDataEvents(raw);

    expect(events).toHaveLength(4);
    expect(events[3]).toBe("[DONE]");

    const roleChunk = events[0] as {
      object: string;
      choices: Array<{ delta: { role?: string; content?: string } }>;
    };
    expect(roleChunk.object).toBe("chat.completion.chunk");
    expect(roleChunk.choices[0].delta.role).toBe("assistant");
    expect(roleChunk.choices[0].delta.content).toBe("");

    const contentChunk = events[1] as {
      choices: Array<{ delta: { content?: string } }>;
    };
    expect(contentChunk.choices[0].delta.content).toContain("drei Kilo");

    const stopChunk = events[2] as {
      choices: Array<{ finish_reason?: string }>;
    };
    expect(stopChunk.choices[0].finish_reason).toBe("stop");

    expect(raw).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
  });

  it("streams German VAD no-op content instead of 400 for empty user message", async () => {
    const response = await postChat({
      stream: true,
      messages: [{ role: "user", content: "   " }],
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(
      /text\/event-stream/i,
    );

    const events = parseSseDataEvents(await response.text());
    const contentChunk = events[1] as {
      choices: Array<{ delta: { content?: string } }>;
    };

    expect(contentChunk.choices[0].delta.content).toBe(
      HEYGEN_VAD_NOOP_RESPONSE_DE,
    );
    expect(events[3]).toBe("[DONE]");
  });

  it("streams VAD no-op when no user role is present", async () => {
    const response = await postChat({
      stream: true,
      messages: [{ role: "system", content: "context only" }],
    });

    expect(response.status).toBe(200);
    const events = parseSseDataEvents(await response.text());
    const contentChunk = events[1] as {
      choices: Array<{ delta: { content?: string } }>;
    };
    expect(contentChunk.choices[0].delta.content).toBe(
      HEYGEN_VAD_NOOP_RESPONSE_DE,
    );
  });

  it("still returns 400 for invalid session UUID when stream:true", async () => {
    const response = await postChat(
      {
        stream: true,
        messages: [{ role: "user", content: "Test" }],
      },
      { "x-fsp-session-id": "not-a-uuid" },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_session_id");
  });

  it("encodeOpenAiStreamingBody matches chunk contract", () => {
    const result = processChatCompletion(
      { messages: [{ role: "user", content: "Hallo" }] },
      { store, scenario },
    );
    const chunks = buildOpenAiStreamingChunks(result);
    const encoded = encodeOpenAiStreamingBody(result);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    expect(chunks[1].choices[0].delta.content).toBe(
      result.choices[0].message.content,
    );
    expect(chunks[2].choices[0].finish_reason).toBe("stop");
    expect(encoded.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});

describe("Custom LLM non-streaming preserved", () => {
  it("returns JSON chat.completion when stream is false", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat(
      {
        stream: false,
        messages: [{ role: "user", content: "Haben Sie Fieber?" }],
      },
      { "x-fsp-session-id": session.id },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);
    expect(body.object).toBe("chat.completion");
    expect(body.x_fsp.session_id).toBe(session.id);
    expect(typeof body.choices[0].message.content).toBe("string");
  });

  it("returns JSON chat.completion when stream is omitted", async () => {
    const response = await postChat({
      messages: [{ role: "user", content: "Guten Tag" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.role).toBe("assistant");
  });

  it("POST /chat/completions alias supports stream:true", async () => {
    const response = await chatCompatPost(
      new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stream: true,
          messages: [{ role: "user", content: "   " }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(
      /text\/event-stream/i,
    );
    const events = parseSseDataEvents(await response.text());
    expect(events[3]).toBe("[DONE]");
  });
});
