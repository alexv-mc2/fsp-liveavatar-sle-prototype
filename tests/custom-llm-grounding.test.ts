import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import {
  clearScenarioContextCacheForTests,
  loadSystemPromptMarkdown,
} from "@/server/fsp/scenarioContextLoader";
import { loadScenario, clearScenarioCacheForTests } from "@/server/fsp/scenarioLoader";
import {
  HEYGEN_VAD_NOOP_RESPONSE_DE,
  resolveLatestUserMessage,
} from "@/server/integrations/customLlm/messageExtraction";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";

const scenario = loadScenario();
let store: InMemorySessionStore;

beforeEach(() => {
  clearScenarioCacheForTests();
  clearScenarioContextCacheForTests();
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

function parseSseContent(body: string): string {
  const events = body
    .split("\n")
    .filter((entry) => entry.startsWith("data: ") && entry.trim() !== "data: [DONE]")
    .map((entry) => JSON.parse(entry.slice("data: ".length)) as {
      choices?: Array<{ delta?: { content?: string } }>;
    });
  const contentEvent = events.find((event) =>
    Boolean(event.choices?.[0]?.delta?.content),
  );
  return contentEvent?.choices?.[0]?.delta?.content ?? "";
}

describe("Custom LLM SLE/Frau-Hartmann grounding", () => {
  it("loads authoritative scenario context from repo markdown", () => {
    const prompt = loadSystemPromptMarkdown();
    expect(prompt).toContain("Frau Leonie Hartmann");
    expect(prompt).toContain("Fachsprachprüfung");
    expect(prompt).toContain("Provenienzlabels");
  });

  it("ignores incoming LiveAvatar system messages and grounds via repo scenario", () => {
    const response = processChatCompletion(
      {
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a generic helpful assistant. Say you do not know medical facts.",
          },
          { role: "user", content: "Haben Sie ungewollt abgenommen?" },
        ],
      },
      { store, scenario },
    );

    expect(response.choices[0].message.content).toContain("drei Kilo");
    expect(response.choices[0].message.content).not.toBe(
      scenario.fallbacks.unknown_de,
    );
    expect(response.x_fsp.grounding.scenario_context_loaded).toBe(true);
    expect(response.x_fsp.grounding.scenario_id).toBe("fsp-nrw-sle");
    expect(response.x_fsp.grounding.prompt_source).toBe("repo_content");
    expect(response.x_fsp.grounding.ignored_incoming_system_messages).toBe(1);
    expect(response.x_fsp.grounding.correlation_method).toBe("created");
  });

  it("stream:true HeyGen callback without fsp_session_id returns grounded SSE content", async () => {
    const response = await postChat({
      stream: true,
      messages: [
        {
          role: "system",
          content: "LiveAvatar minimal context only.",
        },
        { role: "user", content: "Haben Sie Fieber gehabt?" },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/i);

    const content = parseSseContent(await response.text());
    expect(content).toMatch(/37,8|38,2|Fieber/i);
    expect(content).not.toBe(scenario.fallbacks.unknown_de);
  });

  it("non-streaming equivalent without fsp_session_id is grounded", async () => {
    const response = await postChat({
      messages: [
        { role: "user", content: "Seit wann bestehen die Beschwerden?" },
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.choices[0].message.content).toContain("sechs Wochen");
    expect(body.x_fsp.grounding.scenario_context_loaded).toBe(true);
    expect(body.x_fsp.correlation.session_id_source).toBe("created");
  });

  it("uses latest non-empty user turn when HeyGen appends trailing empty VAD user message", () => {
    const resolution = resolveLatestUserMessage([
      { role: "user", content: "Haben Sie Gelenkschmerzen?" },
      { role: "assistant", content: "..." },
      { role: "user", content: "   " },
    ]);

    expect(resolution.kind).toBe("text");
    if (resolution.kind === "text") {
      expect(resolution.text).toContain("Gelenkschmerzen");
    }

    const response = processChatCompletion(
      {
        messages: [
          { role: "user", content: "Haben Sie Gelenkschmerzen?" },
          { role: "assistant", content: "..." },
          { role: "user", content: "" },
        ],
      },
      { store, scenario },
    );

    expect(response.choices[0].message.content).toMatch(/Handgelenk|Gelenk/i);
    expect(response.x_fsp.vad_noop).toBeUndefined();
  });

  it("VAD no-op still returns filler for empty-only user messages without session mutation", async () => {
    const session = store.create(scenario);
    const beforeTurns = store.require(session.id).transcriptTurns.length;

    const response = await postChat({
      stream: true,
      messages: [{ role: "user", content: "   " }],
    });

    expect(response.status).toBe(200);
    const content = parseSseContent(await response.text());
    expect(content).toBe(HEYGEN_VAD_NOOP_RESPONSE_DE);
    expect(store.require(session.id).transcriptTurns.length).toBe(beforeTurns);
  });

  it("returns 400 for invalid session UUID with stream:true", async () => {
    const response = await postChat(
      {
        stream: true,
        messages: [{ role: "user", content: "Haben Sie Fieber?" }],
      },
      { "x-fsp-session-id": "not-a-uuid" },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_session_id");
  });

  it("does not log PHI or full hidden facts in x_fsp grounding fields", async () => {
    const response = await postChat({
      messages: [{ role: "user", content: "Wie hoch ist Ihr ANA-Titer?" }],
    });
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("1:640");
    expect(serialized).not.toMatch(/answer_de/);
    expect(serialized).toContain('"scenario_id":"fsp-nrw-sle"');
  });
});
