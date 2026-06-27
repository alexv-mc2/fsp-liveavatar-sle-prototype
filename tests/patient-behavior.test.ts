import { beforeEach, describe, expect, it } from "vitest";
import { POST as chatRoutePost } from "@/app/v1/chat/completions/route";
import { resolvePatientResponse } from "@/server/fsp/patientBehavior/resolvePatientResponse";
import { loadScenario, clearScenarioCacheForTests } from "@/server/fsp/scenarioLoader";
import { InMemorySessionStore, sessionStore } from "@/server/fsp/scenarioState";
import { processChatCompletion } from "@/server/routes/chatCompletions";

const scenario = loadScenario();
let store: InMemorySessionStore;

beforeEach(() => {
  clearScenarioCacheForTests();
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

function ask(userText: string, sessionId?: string) {
  return processChatCompletion(
    {
      messages: [{ role: "user", content: userText }],
      ...(sessionId ? { session_id: sessionId } : {}),
    },
    { store, scenario },
  );
}

function askInSession(userText: string, sessionId: string) {
  return ask(userText, sessionId);
}

describe("Patient behavior engine (Frau Leonie Hartmann / SLE)", () => {
  describe("biography (patient_known from scenario.patient)", () => {
    it("returns name from patient block", () => {
      const response = ask("Wie heißen Sie?");
      expect(response.choices[0].message.content).toBe("Ich heiße Leonie Hartmann.");
      expect(response.x_fsp.patient_behavior?.response_class).toBe("neutral_default");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.name");
    });

    it("returns age from patient block", () => {
      const response = ask("Wie alt sind Sie?");
      expect(response.choices[0].message.content).toBe("Ich bin 29 Jahre alt.");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.age");
    });

    it("returns occupation from patient block", () => {
      const response = ask("Was machen Sie beruflich?");
      expect(response.choices[0].message.content).toContain("Grundschullehrerin");
    });

    it("returns full name spelling", () => {
      const response = ask("Buchstabieren Sie bitte Ihren Namen");
      expect(response.choices[0].message.content).toBe(
        "Mein Vorname ist L-E-O-N-I-E, mein Nachname H-A-R-T-M-A-N-N.",
      );
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.full_name_spelling");
    });

    it("returns given name spelling", () => {
      const response = ask("Können Sie Ihren Vornamen buchstabieren?");
      expect(response.choices[0].message.content).toBe("L-E-O-N-I-E");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.given_name_spelling");
    });

    it("returns family name spelling", () => {
      const response = ask("Können Sie Ihren Nachnamen buchstabieren?");
      expect(response.choices[0].message.content).toBe("H-A-R-T-M-A-N-N");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.family_name_spelling");
    });

    it("repeats the last biography answer on wiederholen", () => {
      const session = store.create(scenario);
      const first = askInSession("Wie heißen Sie?", session.id);
      expect(first.choices[0].message.content).toBe("Ich heiße Leonie Hartmann.");

      const repeat = askInSession("Können Sie das bitte wiederholen?", session.id);
      expect(repeat.choices[0].message.content).toBe("Ich heiße Leonie Hartmann.");
      expect(repeat.x_fsp.patient_behavior?.intent).toBe("biography.repeat");
      expect(repeat.choices[0].message.content).not.toBe(scenario.fallbacks.unknown_de);
    });

    it("returns date of birth in spoken form", () => {
      const response = ask("Wann sind Sie geboren?");
      expect(response.choices[0].message.content).toBe(
        "Ich bin am vierzehnter Februar neunzehnhundertsiebenundneunzig geboren.",
      );
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.dob");
    });

    it("returns written Geburtsdatum", () => {
      const response = ask("Wie ist Ihr Geburtsdatum?");
      expect(response.choices[0].message.content).toBe("Mein Geburtsdatum ist der 14.02.1997.");
    });

    it("returns height in lay German", () => {
      const response = ask("Wie groß sind Sie?");
      expect(response.choices[0].message.content).toBe("Ich bin ungefähr 168 Zentimeter groß.");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.height");
    });

    it("returns current weight only when asked generally", () => {
      const response = ask("Wie viel wiegen Sie?");
      expect(response.choices[0].message.content).toBe("Ich wiege ungefähr 59 Kilo.");
      expect(response.choices[0].message.content).not.toMatch(/62|früher/i);
    });

    it("returns previous weight only when weight change is asked", () => {
      const response = ask("Wie viel wiegen Sie, und wie war Ihr Gewicht früher?");
      expect(response.choices[0].message.content).toMatch(/59 Kilo/);
      expect(response.choices[0].message.content).toMatch(/62 Kilo/);
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.weight_change");
    });

    it("returns Hausarzt from patient block", () => {
      const response = ask("Wie heißt Ihr Hausarzt?");
      expect(response.choices[0].message.content).toBe(
        "Mein Hausarzt ist Dr. Markus Schneider in der Hausarztpraxis Dr. Schneider in Düsseldorf.",
      );
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.gp");
    });
  });

  describe("chief complaint opener (asked-only lay language)", () => {
    const openerQuestions = [
      "Warum sind Sie gekommen?",
      "Was führt Sie zu uns?",
      "Was ist Ihr Problem?",
    ] as const;

    it.each(openerQuestions)("opener %s gives only main joint complaint", (question) => {
      const response = ask(question);
      const content = response.choices[0].message.content;
      expect(content).toMatch(/Schmerzen.*Hand/i);
      expect(content).not.toMatch(/müde|erschöpft|Temperatur|Sonne|Gesicht|Kilo|Blut/i);
      expect(response.x_fsp.patient_behavior?.intent).toBe("chief_complaint.opener");
    });

    it.each([
      ["Sind Sie müde oder erschöpft?", /müde|erschöpft|erledigt/i],
      ["Haben Sie eine Rötung im Gesicht bemerkt?", /Wangen|Nase|Rötung/i],
      ["Hatten Sie erhöhte Temperatur?", /37,8|38,2|Temperatur|Fieber/i],
      ["Haben Sie ungewollt abgenommen?", /Kilo|abgenommen/i],
    ] as const)("follow-up %s is answered when specifically asked", (question, pattern) => {
      const response = ask(question);
      expect(response.choices[0].message.content).toMatch(pattern);
    });

    it("does not volunteer fatigue on opener but answers müde when asked", () => {
      const opener = ask("Warum sind Sie gekommen?");
      expect(opener.choices[0].message.content).not.toMatch(/müde|erschöpft/i);

      const followUp = ask("Fühlen Sie sich müde?");
      expect(followUp.choices[0].message.content).toMatch(/müde|erledigt/i);
    });
  });

  describe("LiveAvatar STT alias regression (run 1e8567c2)", () => {
    it.each([
      ["Wie nennen Sie sich?", "Leonie Hartmann", "biography.name"],
      ["Wie ist Ihr Vorname?", "Leonie Hartmann", "biography.name"],
      ["Wie heißt", "Leonie Hartmann", "biography.name"],
      ["Wer sind Sie?", "Leonie Hartmann", "biography.name"],
      ["Wie heißen Sie?", "Leonie Hartmann", "biography.name"],
    ] as const)("name STT variant %s", (question, expectedSnippet, intent) => {
      const response = ask(question);
      expect(response.choices[0].message.content).toContain(expectedSnippet);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("neutral_default");
      expect(response.x_fsp.patient_behavior?.intent).toBe(intent);
    });

    it("preserves age matching alongside name aliases", () => {
      const response = ask("Wie alt sind Sie?");
      expect(response.choices[0].message.content).toBe("Ich bin 29 Jahre alt.");
      expect(response.x_fsp.patient_behavior?.intent).toBe("biography.age");
    });

    it("blocks de-jargonized lab Wert phrasing from run 1e8567c2", () => {
      const response = ask("Was ist mit dem Wert bitte?");
      expect(response.choices[0].message.content).toMatch(/Blutwerte|Arzt erklären/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
      expect(response.choices[0].message.content).not.toBe(scenario.fallbacks.unknown_de);
    });

    it("blocks canonical ANA-Titer phrasing", () => {
      const response = ask("Wie hoch ist Ihr ANA-Titer?");
      expect(response.choices[0].message.content).toMatch(/Blutwerte|Arzt erklären/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
    });
  });

  describe("imperfect learner German / STT recovery", () => {
    const labDeferral = /Blutwerte|Arzt erklären/i;

    it.each([
      "Wie hoch ist Ihr A1-Titer?",
      "Wie hoch ist Ihr Ana Titer?",
      "Anatiter?",
      "Was ist mit dem Wert?",
      "Blutwert?",
    ] as const)("lab STT variant %s → deferral not unknown", (question) => {
      const response = ask(question);
      expect(response.choices[0].message.content).toMatch(labDeferral);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
      expect(response.choices[0].message.content).not.toBe(scenario.fallbacks.unknown_de);
      expect(response.choices[0].message.content).not.toMatch(/^Nein,/);
    });

    it("asks to repeat truncated Wie hoch ist", () => {
      const response = ask("Wie hoch ist");
      expect(response.choices[0].message.content).toBe(
        "Entschuldigung, können Sie die Frage bitte wiederholen?",
      );
      expect(response.x_fsp.patient_behavior?.response_class).toBe("clarify");
      expect(response.choices[0].message.content).not.toBe(scenario.fallbacks.unknown_de);
    });

    it("Raynaud lay answer without medical jargon", () => {
      const response = ask("Werden Ihre Finger bei Kälte weiß oder blau?");
      expect(response.choices[0].message.content).toMatch(/nicht bemerkt/i);
      expect(response.choices[0].message.content).not.toMatch(/Raynaud|triphas|Handgelenk/i);
    });

    it("preserves canonical name, age, drugs, joints", () => {
      expect(ask("Wie heißen Sie?").choices[0].message.content).toContain("Leonie Hartmann");
      expect(ask("Wie alt sind Sie?").choices[0].message.content).toContain("29 Jahre alt");
      expect(ask("Nehmen Sie Drogen?").choices[0].message.content).toMatch(/keine Drogen/i);
      expect(ask("Seit wann bestehen die Beschwerden?").choices[0].message.content).toContain(
        "sechs Wochen",
      );
      expect(ask("Haben Sie Gelenkschmerzen?").choices[0].message.content).toMatch(/Handgelenk|Finger/i);
    });

    it("routes Raynaud color-change before joint finger pain", () => {
      const session = store.create(scenario);
      session.phase = "anamnesis_active";
      const resolution = resolvePatientResponse(
        "Werden Ihre Finger bei Kälte weiß oder blau?",
        session,
        scenario,
      );
      expect(resolution.responseClass).toBe("case_negative");
      expect(resolution.responseDe).toMatch(/nicht bemerkt/i);
      expect(resolution.responseDe).toMatch(/weiß|blau/i);
      expect(resolution.responseDe).not.toMatch(/Raynaud|triphas|Handgelenk|Fingergrund/i);
      expect(resolution.revealedFactIds).toContain("raynaud_negative");
      expect(resolution.revealedFactIds).not.toContain("joint_pain_pattern");
    });

    it("still routes ordinary finger joint pain to joint facts", () => {
      const response = ask("Haben Sie Schmerzen in den Fingern?");
      expect(response.choices[0].message.content).toMatch(/Handgelenk|Finger/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("case_positive");
    });
  });

  describe("SLE-path positives (case_positive)", () => {
    it("reveals joint pain pattern", () => {
      const response = ask("Haben Sie Gelenkschmerzen?");
      expect(response.choices[0].message.content).toMatch(/Handgelenk|Finger/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("case_positive");
      expect(response.x_fsp.revealed_fact_ids).toContain("joint_pain_pattern");
    });

    it("reveals timeline", () => {
      const response = ask("Seit wann bestehen die Beschwerden?");
      expect(response.choices[0].message.content).toContain("sechs Wochen");
    });

    it("reveals photosensitivity", () => {
      const response = ask("Reagieren Sie empfindlich auf Sonne?");
      expect(response.choices[0].message.content).toMatch(/Sonne|rot/i);
    });

    it("reveals butterfly rash", () => {
      const response = ask("Haben Sie einen Ausschlag im Gesicht?");
      expect(response.choices[0].message.content).toMatch(/Wangen|Nase|Rötung/i);
    });
  });

  describe("canonical negatives (case_negative)", () => {
    it("denies oral ulcers", () => {
      const response = ask("Haben Sie Aphthen oder Geschwüre im Mund?");
      expect(response.choices[0].message.content).toMatch(/Nein.*Geschwür/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("case_negative");
    });

    it("denies Raynaud phenomenon", () => {
      const response = ask("Werden Ihre Finger bei Kälte weiß oder blau?");
      expect(response.choices[0].message.content).toMatch(/Nein.*weiß|blau/i);
    });

    it("denies hair loss", () => {
      const response = ask("Haben Sie Haarausfall bemerkt?");
      expect(response.choices[0].message.content).toMatch(/Nein.*Haarausfall/i);
    });

    it("denies sicca symptoms", () => {
      const response = ask("Haben Sie trockene Augen oder einen trockenen Mund?");
      expect(response.choices[0].message.content).toMatch(/Nein.*trocken/i);
    });

    it("denies chest pain and dyspnea", () => {
      const response = ask("Haben Sie Brustschmerzen oder Atemnot?");
      expect(response.choices[0].message.content).toMatch(/Nein.*Brustschmerz|Luftnot/i);
    });

    it("denies renal symptoms", () => {
      const response = ask("Haben Sie Blut im Urin oder geschwollene Beine?");
      expect(response.choices[0].message.content).toMatch(/Nein/i);
    });
  });

  describe("ambiguous questions (clarify)", () => {
    it("clarifies Familie?", () => {
      const response = ask("Familie?");
      expect(response.choices[0].message.content).toContain("zusammenlebe");
      expect(response.x_fsp.patient_behavior?.response_class).toBe("clarify");
    });

    it("clarifies Nehmen Sie etwas?", () => {
      const response = ask("Nehmen Sie etwas?");
      expect(response.choices[0].message.content).toMatch(/Medikamente|Alkohol|Drogen/);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("clarify");
    });

    it("clarifies Trinken Sie?", () => {
      const response = ask("Trinken Sie?");
      expect(response.choices[0].message.content).toContain("Alkohol");
    });
  });

  describe("broad questions", () => {
    it("returns opening or salient facts for Sonst noch Beschwerden?", () => {
      const response = ask("Sonst noch Beschwerden?");
      expect(response.choices[0].message.content.length).toBeGreaterThan(20);
      expect(response.x_fsp.patient_behavior?.intent).toBe("broad.anamnesis");
    });
  });

  describe("jargon questions", () => {
    it("asks for simpler wording on arthralgie", () => {
      const response = ask("Haben Sie Arthralgien?");
      expect(response.choices[0].message.content).toMatch(/einfacher|kenne ich nicht/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("clarify");
    });
  });

  describe("examiner-only blocks", () => {
    it("blocks ANA titer in anamnesis", () => {
      const response = ask("Wie hoch ist Ihr ANA-Titer?");
      expect(response.choices[0].message.content).toMatch(/Blutwerte|Arzt erklären/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
      expect(response.choices[0].message.content).not.toContain("1:640");
    });

    it("blocks EULAR/ACR classification", () => {
      const response = ask("Wie viele EULAR/ACR Punkte haben Sie?");
      expect(response.choices[0].message.content).toMatch(/Klassifikation|Punkten/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
    });

    it("blocks hidden SLE diagnosis question", () => {
      const response = ask("Haben Sie schon Lupus?");
      expect(response.choices[0].message.content).toMatch(/nicht gesagt|Beswerden/i);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("examiner_only_block");
    });
  });

  describe("collision guards", () => {
    it("routes Nehmen Sie Drogen? to drugs_none not ibuprofen", () => {
      const response = ask("Nehmen Sie Drogen?");
      expect(response.choices[0].message.content).toMatch(/keine Drogen/i);
      expect(response.choices[0].message.content).not.toMatch(/Ibuprofen/i);
    });

    it("routes Familienanamnese to family_history not family_status", () => {
      const response = ask("Gibt es Krankheiten in Ihrer Familie?");
      expect(response.choices[0].message.content).toMatch(/Hashimoto|Rheuma/i);
      expect(response.choices[0].message.content).not.toMatch(/dreijährigen Tochter/i);
    });

    it("does not match atemnot from allergy answer on unrelated question", () => {
      const response = ask("Haben Sie Allergien?");
      expect(response.choices[0].message.content).toMatch(/Amoxicillin/i);
      expect(response.choices[0].message.content).not.toMatch(/Brustschmerz|Luftnot/i);
    });
  });

  describe("leading questions", () => {
    it("prefers negative fact over leading premise", () => {
      const session = store.create(scenario);
      session.phase = "anamnesis_active";
      const resolution = resolvePatientResponse(
        "Sie haben doch sicher Raynaud, oder?",
        session,
        scenario,
      );
      expect(resolution.responseClass).toBe("case_negative");
      expect(resolution.responseDe).toMatch(/Nein/i);
    });
  });

  describe("substance routing after clarification context", () => {
    it("answers alcohol specifically", () => {
      const response = ask("Trinken Sie Alkohol?");
      expect(response.choices[0].message.content).toMatch(/Wein/i);
    });

    it("answers medications specifically", () => {
      const response = ask("Nehmen Sie Medikamente?");
      expect(response.choices[0].message.content).toMatch(/Ibuprofen/i);
    });
  });

  describe("family status when specific", () => {
    it("answers marital status and daughter", () => {
      const response = ask("Sind Sie verheiratet und mit wem leben Sie?");
      expect(response.choices[0].message.content).toMatch(/verheiratet|Mann|Tochter/i);
    });
  });

  describe("patient_unknown fallback", () => {
    it("uses unknown_de for unrelated unknowable detail", () => {
      const response = ask("Wie viele Stufen hat Ihre Treppe zu Hause?");
      expect(response.choices[0].message.content).toBe(scenario.fallbacks.unknown_de);
      expect(response.x_fsp.patient_behavior?.response_class).toBe("patient_unknown");
    });
  });

  describe("HTTP integration: stream and non-stream without fsp_session_id", () => {
    it("non-streaming HeyGen-style request exposes patient_behavior", async () => {
      const response = await postChat({
        messages: [{ role: "user", content: "Wie heißen Sie?" }],
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.choices[0].message.content).toContain("Leonie Hartmann");
      expect(body.x_fsp.patient_behavior.response_class).toBe("neutral_default");
      expect(body.x_fsp.correlation.session_id_source).toBe("created");
    });

    it("stream:true HeyGen-style request returns grounded SSE with SLE fact", async () => {
      const response = await postChat({
        stream: true,
        messages: [{ role: "user", content: "Haben Sie Fieber gehabt?" }],
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/text\/event-stream/i);

      const content = parseSseContent(await response.text());
      expect(content).toMatch(/37,8|38,2|Fieber/i);
    });

    it("stream:true blocks lab values in SSE", async () => {
      const response = await postChat({
        stream: true,
        messages: [{ role: "user", content: "Was zeigt Ihr Anti-dsDNA?" }],
      });
      const content = parseSseContent(await response.text());
      expect(content).not.toContain("95 IU");
      expect(content).toMatch(/Blutwerte|Arzt erklären/i);
    });

    it("stream:true resolves STT name alias Wie nennen Sie sich?", async () => {
      const response = await postChat({
        stream: true,
        messages: [{ role: "user", content: "Wie nennen Sie sich?" }],
      });
      const content = parseSseContent(await response.text());
      expect(content).toContain("Leonie Hartmann");
    });

    it("non-streaming resolves de-jargonized lab Wert phrasing", async () => {
      const response = await postChat({
        messages: [{ role: "user", content: "Was ist mit dem Wert bitte?" }],
      });
      const body = await response.json();
      expect(body.choices[0].message.content).toMatch(/Blutwerte|Arzt erklären/i);
      expect(body.x_fsp.patient_behavior.response_class).toBe("examiner_only_block");
    });

    it("stream:true defers imperfect A1-Titer STT variant", async () => {
      const response = await postChat({
        stream: true,
        messages: [{ role: "user", content: "Wie hoch ist Ihr A1-Titer?" }],
      });
      const content = parseSseContent(await response.text());
      expect(content).toMatch(/Blutwerte|Arzt erklären/i);
    });

    it("non-streaming asks to repeat truncated Wie hoch ist", async () => {
      const response = await postChat({
        messages: [{ role: "user", content: "Wie hoch ist" }],
      });
      const body = await response.json();
      expect(body.choices[0].message.content).toContain("wiederholen");
      expect(body.x_fsp.patient_behavior.response_class).toBe("clarify");
    });
  });
});
