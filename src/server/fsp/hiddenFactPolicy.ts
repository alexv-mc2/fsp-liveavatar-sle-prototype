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

const FACT_QUERY_ALIASES: Record<string, string[]> = {
  chief_fatigue: ["müde", "mued", "erschöpft", "erschoepft", "schwäche", "schwaeche"],
  timeline_weeks: ["seit wann", "wie lange", "wann angefangen", "bestehen die"],
  joint_pain_pattern: ["gelenk", "gelenke", "handgelenk", "handschmerz"],
  morning_stiffness: ["morgensteif", "morgens steif", "steifigkeit"],
  butterfly_rash: ["ausschlag", "gesicht rot", "schmetterling"],
  photosensitivity: ["sonne", "sonnenlicht", "lichtempfindlich"],
  intermittent_fever: ["fieber", "temperatur", "schüttelfrost", "schuettelfrost"],
  night_sweats: ["nachtschweiß", "nachtschweiss", "nachthemd"],
  weight_loss: ["abgenommen", "gewicht verloren", "gewichtsverlust", "kilo"],
  sleep_disturbance: ["schlaf", "durchschlafen", "aufwachen"],
};

const STOPWORD_TOKENS = new Set([
  "haben",
  "habe",
  "hatte",
  "nicht",
  "eine",
  "einer",
  "einem",
  "ihre",
  "ihren",
  "meine",
  "bitte",
  "schon",
  "sehr",
  "auch",
  "noch",
  "wird",
  "waren",
  "wurde",
]);

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 5 && !STOPWORD_TOKENS.has(token));
}

function findKeywordMatch(fact: ScenarioFact, normalizedInput: string): string | null {
  for (const keyword of fact.trigger_keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword && normalizedInput.includes(normalizedKeyword)) {
      return keyword;
    }
  }

  for (const alias of FACT_QUERY_ALIASES[fact.id] ?? []) {
    const normalizedAlias = normalize(alias);
    if (normalizedAlias && normalizedInput.includes(normalizedAlias)) {
      return alias;
    }
  }

  const inputTokens = new Set(tokenize(normalizedInput));
  for (const token of tokenize(fact.answer_de)) {
    if (inputTokens.has(token)) {
      return token;
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
    const asksForClassification = blocked.some(
      (entry) =>
        entry.fact.category === "classification" ||
        entry.fact.id === "classification_eular_acr",
    );
    return {
      responseDe: asksForClassification
        ? (scenario.fallbacks.classification_in_patient_phase_de ??
            scenario.fallbacks.lab_in_patient_phase_de)
        : asksForLab
          ? scenario.fallbacks.lab_in_patient_phase_de
          : scenario.fallbacks.examiner_only_de,
      revealedFactIds: [],
      blockedFactIds: blocked.map((entry) => entry.fact.id),
      matchedKeywords: blocked.map((entry) => entry.keyword),
    };
  }

  const now = new Date().toISOString();
  const surfaced = allowed.slice(0, 2);
  const newlyRevealed: string[] = [];

  for (const { fact, keyword } of surfaced) {
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
    responseDe: surfaced.map((entry) => entry.fact.answer_de).join(" "),
    revealedFactIds: newlyRevealed,
    blockedFactIds: blocked.map((entry) => entry.fact.id),
    matchedKeywords: [...surfaced, ...blocked].map((entry) => entry.keyword),
  };
}
