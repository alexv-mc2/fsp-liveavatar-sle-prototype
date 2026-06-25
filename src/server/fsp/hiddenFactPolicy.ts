import type {
  FactRevealEvent,
  ScenarioFact,
  SessionState,
  SleScenario,
} from "./types";

export interface HiddenFactResolution {
  responseDe: string;
  revealedFactIds: string[];
  blockedFactIds: string[];
  matchedKeywords: string[];
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findKeywordMatch(fact: ScenarioFact, normalizedInput: string): string | null {
  for (const keyword of fact.trigger_keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword && normalizedInput.includes(normalizedKeyword)) {
      return keyword;
    }
  }
  return null;
}

export function resolveHiddenFacts(
  input: string,
  session: SessionState,
  scenario: SleScenario,
): HiddenFactResolution {
  const normalizedInput = normalize(input);
  const matched = scenario.facts
    .map((fact) => ({ fact, keyword: findKeywordMatch(fact, normalizedInput) }))
    .filter(
      (entry): entry is { fact: ScenarioFact; keyword: string } =>
        entry.keyword !== null,
    );

  if (matched.length === 0) {
    return {
      responseDe: scenario.fallbacks.unknown_de,
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
    };
  }

  const allowed: Array<{ fact: ScenarioFact; keyword: string }> = [];
  const blocked: Array<{ fact: ScenarioFact; keyword: string }> = [];

  for (const entry of matched) {
    const phaseAllowed = entry.fact.allowed_phases.includes(session.phase);
    if (entry.fact.visibility === "examiner_only" || !phaseAllowed) {
      blocked.push(entry);
    } else {
      allowed.push(entry);
    }
  }

  if (allowed.length === 0) {
    const asksForLab = blocked.some((entry) => entry.fact.category === "laboratory");
    return {
      responseDe: asksForLab
        ? scenario.fallbacks.lab_in_patient_phase_de
        : scenario.fallbacks.examiner_only_de,
      revealedFactIds: [],
      blockedFactIds: blocked.map((entry) => entry.fact.id),
      matchedKeywords: blocked.map((entry) => entry.keyword),
    };
  }

  const newlyRevealed: string[] = [];
  const now = new Date().toISOString();

  for (const { fact, keyword } of allowed) {
    if (!session.revealedFactIds.has(fact.id)) {
      session.revealedFactIds.add(fact.id);
      newlyRevealed.push(fact.id);
    }
    if (fact.checklist_item) {
      session.askedChecklistItems.add(fact.checklist_item);
    }

    const revealEvent: FactRevealEvent = {
      factId: fact.id,
      matchedKeyword: keyword,
      phase: session.phase,
      timestamp: now,
    };
    session.factRevealEvents.push(revealEvent);
  }

  session.updatedAt = now;

  return {
    responseDe: allowed
      .slice(0, 2)
      .map((entry) => entry.fact.answer_de)
      .join(" "),
    revealedFactIds: newlyRevealed,
    blockedFactIds: blocked.map((entry) => entry.fact.id),
    matchedKeywords: [...allowed, ...blocked].map((entry) => entry.keyword),
  };
}
