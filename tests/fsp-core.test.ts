import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as phaseRoutePatch } from "@/app/api/sessions/[sessionId]/phase/route";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import { InMemorySessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";
import { resetSession } from "@/server/routes/sessions";

const scenario = loadScenario();
let store: InMemorySessionStore;

beforeEach(() => {
  store = new InMemorySessionStore();
});

function chat(sessionId: string, content: string) {
  return processChatCompletion(
    {
      model: "fsp-sle-test",
      session_id: sessionId,
      messages: [{ role: "user", content }],
    },
    { store, scenario },
  );
}

describe("deterministic hidden-fact policy", () => {
  it("does not reveal a hidden fact before a matching question", () => {
    const session = store.create(scenario);

    const generic = chat(session.id, "Wie geht es Ihnen heute?");
    expect(generic.choices[0].message.content).not.toContain("drei Kilo");
    expect(store.require(session.id).revealedFactIds.has("weight_loss")).toBe(
      false,
    );

    const matched = chat(session.id, "Haben Sie ungewollt abgenommen?");
    expect(matched.choices[0].message.content).toContain("drei Kilo");
    expect(store.require(session.id).revealedFactIds.has("weight_loss")).toBe(
      true,
    );
  });

  it("does not invent or expose lab values in the patient phase", () => {
    const session = store.create(scenario);
    const response = chat(session.id, "Wie hoch ist Ihr ANA-Titer?");
    const content = response.choices[0].message.content;

    expect(content).toContain("Laborwerte kenne ich nicht");
    expect(content).not.toContain("1:640");
    expect(response.x_fsp.blocked_fact_ids).toContain("lab_ana");
  });
});

describe("medical-training guardrails", () => {
  it("leaves role-play when a real user asks for medical advice", () => {
    const session = store.create(scenario);
    const response = chat(
      session.id,
      "Ich selbst habe starke Brustschmerzen. Was soll ich tun?",
    );

    expect(response.x_fsp.safety_flag).toBe("possible_emergency");
    expect(response.choices[0].message.content).toContain(
      "Trainingssimulation",
    );
    expect(response.choices[0].message.content).toContain("112");
  });
});

describe("session lifecycle", () => {
  it("reset clears all revealed facts", () => {
    const session = store.create(scenario);
    chat(session.id, "Haben Sie abgenommen?");
    expect(store.require(session.id).revealedFactIds.size).toBeGreaterThan(0);

    const reset = resetSession(session.id, { store, scenario });
    expect(reset.revealedFactIds).toEqual([]);
    expect(reset.askedChecklistItems).toEqual([]);
    expect(reset.factRevealEvents).toEqual([]);
  });
});

describe("OpenAI-compatible route", () => {
  it("POST /v1/chat/completions returns an OpenAI-like response shape", async () => {
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fsp-sle-test",
        messages: [{ role: "user", content: "Seit wann bestehen die Beschwerden?" }],
      }),
    });

    const response = await chatRoutePost(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.object).toBe("chat.completion");
    expect(body.id).toMatch(/^chatcmpl-fsp-/);
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0]).toMatchObject({
      index: 0,
      message: { role: "assistant" },
      finish_reason: "stop",
    });
    expect(typeof body.choices[0].message.content).toBe("string");
    expect(body.usage.total_tokens).toBeGreaterThan(0);
    expect(body.x_fsp.mock).toBe(true);
    expect(typeof body.x_fsp.session_id).toBe("string");
  });

  it("returns 400 when no user message is present", async () => {
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "fsp-sle-test",
        messages: [{ role: "system", content: "Only system context." }],
      }),
    });

    const response = await chatRoutePost(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("missing_user_message");
  });
});

describe("phase route validation", () => {
  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost/api/sessions/test-id/phase", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await phaseRoutePatch(request, {
      params: Promise.resolve({ sessionId: "test-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_json");
  });
});
