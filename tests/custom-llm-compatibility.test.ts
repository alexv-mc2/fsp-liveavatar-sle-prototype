import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatCompatPost } from "@/app/chat/completions/route";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";
import { resetSession } from "@/server/routes/sessions";

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

describe("Custom LLM session correlation", () => {
  it("prefers x-fsp-session-id header over body session_id", async () => {
    const headerSession = sessionStore.create(scenario);
    const bodySession = sessionStore.create(scenario);

    const response = await postChat(
      {
        session_id: bodySession.id,
        messages: [{ role: "user", content: "Seit wann?" }],
      },
      { "x-fsp-session-id": headerSession.id },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.session_id).toBe(headerSession.id);
    expect(body.x_fsp.correlation.session_id_source).toBe("header");
  });

  it("accepts metadata.session_id when header and body session_id are absent", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat({
      metadata: {
        session_id: session.id,
        heygen_session_id: "provider-should-be-ignored",
        source: "heygen_liveavatar",
      },
      messages: [{ role: "user", content: "Haben Sie Fieber?" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.session_id).toBe(session.id);
    expect(body.x_fsp.correlation.session_id_source).toBe("metadata_session_id");
    expect(body.x_fsp.correlation.ignored_metadata_keys).toContain(
      "heygen_session_id",
    );
    expect(JSON.stringify(body)).not.toContain("provider-should-be-ignored");
  });

  it("creates a new session when no correlation is provided", async () => {
    const before = sessionStore.create(scenario);
    const response = await postChat({
      messages: [{ role: "user", content: "Guten Tag" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.x_fsp.session_id).not.toBe(before.id);
    expect(body.x_fsp.correlation.session_id_source).toBe("created");
  });

  it("returns 400 for invalid session UUID in header", async () => {
    const response = await postChat(
      { messages: [{ role: "user", content: "Test" }] },
      { "x-fsp-session-id": "not-a-uuid" },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_session_id");
  });
});

describe("Custom LLM safety and mock engine", () => {
  it("blocks lab values in patient phase", async () => {
    const session = store.create(scenario);
    const response = processChatCompletion(
      {
        messages: [{ role: "user", content: "Wie hoch ist Ihr ANA-Titer?" }],
      },
      { store, scenario, headerSessionId: session.id },
    );

    expect(response.choices[0].message.content).toMatch(/Blutwerte kenne ich nicht|Arzt erklären/i);
    expect(response.x_fsp.blocked_fact_ids).toContain("lab_ana");
    expect(response.x_fsp.correlation.session_id_source).toBe("header");
  });

  it("exits role-play for real-user medical advice", async () => {
    const session = store.create(scenario);
    const response = processChatCompletion(
      {
        messages: [
          {
            role: "user",
            content: "Ich selbst habe starke Brustschmerzen. Was soll ich tun?",
          },
        ],
      },
      { store, scenario, headerSessionId: session.id },
    );

    expect(response.x_fsp.safety_flag).toBe("possible_emergency");
    expect(response.choices[0].message.content).toContain("112");
  });

  it("reset clears revealed facts after correlated chat", () => {
    const session = store.create(scenario);
    processChatCompletion(
      { messages: [{ role: "user", content: "Haben Sie abgenommen?" }] },
      { store, scenario, headerSessionId: session.id },
    );
    expect(store.require(session.id).revealedFactIds.size).toBeGreaterThan(0);

    const reset = resetSession(session.id, { store, scenario });
    expect(reset.revealedFactIds).toEqual([]);
  });
});

describe("Custom LLM compatibility route alias", () => {
  it("POST /chat/completions matches OpenAI shape and correlation", async () => {
    const session = sessionStore.create(scenario);
    const response = await chatCompatPost(
      new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fsp-session-id": session.id,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Seit wann?" }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.object).toBe("chat.completion");
    expect(body.x_fsp.session_id).toBe(session.id);
    expect(body.x_fsp.correlation.session_id_source).toBe("header");
  });
});

describe("Custom LLM secret hygiene", () => {
  it("does not echo HeyGen-like secrets in responses", async () => {
    const session = sessionStore.create(scenario);
    const response = await postChat(
      {
        metadata: {
          session_id: session.id,
          heygen_api_key: "sk-test-should-never-appear",
        },
        messages: [{ role: "user", content: "Hallo" }],
      },
    );
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("sk-test-should-never-appear");
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
  });
});
