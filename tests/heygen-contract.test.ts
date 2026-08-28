import { beforeEach, describe, expect, it } from "vitest";
import { GET as heygenStatusGet } from "@/app/api/integrations/heygen/status/route";
import { POST as heygenSessionTokenPost } from "@/app/api/integrations/heygen/session-token/route";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { HEYGEN_ENV, EXPO_WALL_LIVEAVATAR_ENV } from "@/server/integrations/heygen/env";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";

const scenario = loadScenario();
let store: InMemorySessionStore;

beforeEach(() => {
  store = new InMemorySessionStore();
  sessionStore.clear();
  delete process.env[HEYGEN_ENV.API_KEY];
  delete process.env[HEYGEN_ENV.LIVEAVATAR_AVATAR_ID];
  delete process.env[HEYGEN_ENV.PUBLIC_BASE_URL];
  delete process.env[HEYGEN_ENV.LIVEAVATAR_VOICE_ID];
  delete process.env[HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID];
  delete process.env[HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID];
  delete process.env.VERCEL_URL;
  for (const name of Object.values(EXPO_WALL_LIVEAVATAR_ENV)) {
    delete process.env[name];
  }
});

describe("HeyGen placeholder integration", () => {
  it("GET /api/integrations/heygen/status reports not connected", async () => {
    const response = await heygenStatusGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connected).toBe(false);
    expect(body.session_token_configured).toBe(false);
    expect(body.configured).toBe(false);
    expect(body.mode).toBe("FULL");
    expect(body.custom_llm_path).toBe("/v1/chat/completions");
    expect(body.streaming).toBe("openai_sse");
    expect(body.bridge.deployment_target).toBe("vercel");
    expect(body.bridge.session_persistence).toBe("in_memory_deferred_supabase");
    expect(body.env.missing).toContain(HEYGEN_ENV.API_KEY);
  });

  it("POST /api/integrations/heygen/session-token fails closed without secrets", async () => {
    const session = sessionStore.create(scenario);
    const response = await heygenSessionTokenPost(
      new Request("http://localhost/api/integrations/heygen/session-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fsp_session_id: session.id }),
      }),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_configured");
    expect(body.missing_env).toContain(HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(serialized).not.toContain("HEYGEN_API_KEY=");
  });

  it("POST /api/integrations/heygen/session-token does not require same-instance in-memory session", async () => {
    const response = await heygenSessionTokenPost(
      new Request("http://localhost/api/integrations/heygen/session-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fsp_session_id: "00000000-0000-4000-8000-000000000001",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_configured");
    expect(body.missing_env).toContain(HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID);
  });
});

describe("Custom LLM correlation with HeyGen contract", () => {
  it("keeps x-fsp-session-id stable across chat completion calls", async () => {
    const session = store.create(scenario);

    const first = processChatCompletion(
      {
        model: "fsp-sle-test",
        messages: [{ role: "user", content: "Seit wann bestehen die Beschwerden?" }],
      },
      { store, scenario, headerSessionId: session.id },
    );

    const second = processChatCompletion(
      {
        model: "fsp-sle-test",
        session_id: session.id,
        messages: [{ role: "user", content: "Haben Sie Fieber gehabt?" }],
      },
      { store, scenario },
    );

    expect(first.x_fsp.session_id).toBe(session.id);
    expect(second.x_fsp.session_id).toBe(session.id);
    expect(first.object).toBe("chat.completion");
    expect(second.object).toBe("chat.completion");
  });

  it("POST /v1/chat/completions still returns OpenAI-compatible shape", async () => {
    const session = sessionStore.create(scenario);
    const response = await chatRoutePost(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fsp-session-id": session.id,
        },
        body: JSON.stringify({
          model: "fsp-sle-test",
          messages: [{ role: "user", content: "Guten Tag" }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.x_fsp.session_id).toBe(session.id);
    expect(response.headers.get("x-fsp-session-id")).toBe(session.id);
  });
});
