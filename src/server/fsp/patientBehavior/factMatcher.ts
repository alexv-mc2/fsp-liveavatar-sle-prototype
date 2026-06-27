import type { ScenarioFact } from "../types";
import { normalizePatientText, tokenizePatientText } from "./normalize";
import { loadPatientDialogueData } from "./dialogueData";
import { containsNormalizedTerm } from "./textMatch";
import type { FactMatch } from "./types";

const FACT_QUERY_ALIASES: Record<string, string[]> = {
  chief_fatigue: ["müde", "mued", "erschöpft", "erschoepft", "schwäche", "schwaeche", "abgeschlagen"],
  timeline_weeks: ["seit wann", "wie lange", "wann angefangen", "bestehen die"],
  joint_pain_pattern: ["gelenkschmerz", "gelenkschmerzen", "handgelenk", "handschmerz"],
  morning_stiffness: ["morgensteif", "morgens steif", "steifigkeit"],
  butterfly_rash: ["ausschlag", "gesicht rot", "schmetterling", "hautveranderung"],
  photosensitivity: ["sonne", "sonnenlicht", "lichtempfindlich", "sonnenempfindlich"],
  intermittent_fever: ["fieber", "temperatur", "schüttelfrost", "schuettelfrost"],
  night_sweats: ["nachtschweiß", "nachtschweiss", "nachthemd"],
  weight_loss: ["abgenommen", "gewicht verloren", "gewichtsverlust", "kilo"],
  sleep_disturbance: ["schlaf", "durchschlafen", "aufwachen"],
  family_history: ["familienanamnese", "familie krank", "hashimoto", "rheuma in der familie", "krankheiten in der familie", "krankheiten in ihrer familie"],
  family_status: ["verheiratet", "zusammenleben", "ehemann", "tochter"],
  medication_ibuprofen: ["medikament", "tablette", "ibuprofen", "schmerzmittel"],
  drugs_none: ["drogen", "cannabis", "substanz"],
  alcohol_occasional: ["alkohol", "wein", "bier"],
  oral_ulcers_negative: ["aphthe", "mundgeschwur", "nasengeschwur", "geschwur im mund"],
  hair_loss_negative: ["haarausfall", "haare ausgefallen"],
  raynaud_negative: ["raynaud", "kalte finger", "weisse finger", "weisse finger", "blau"],
  gi_symptoms_negative: ["bauchschmerz", "ubelkeit", "uebelkeit", "erbrechen"],
  travel_none: ["ausland", "reise", "tropen", "im urlaub"],
};

/** Tokens in answer_de that must not trigger cross-domain token matches. */
const TOKEN_BLOCKLIST_BY_FACT: Record<string, Set<string>> = {
  allergies_amoxicillin: new Set(["atemnot", "kreislaufprobleme"]),
  medication_ibuprofen: new Set(["nehmen"]),
};

const FACT_PRIORITY_BOOST: Record<string, number> = {
  family_history: 30,
  drugs_none: 40,
  alcohol_occasional: 40,
  medication_ibuprofen: 20,
  red_flag_chest_dyspnea: 25,
  patient_name: 100,
  patient_age: 100,
};

function scoreMatch(
  fact: ScenarioFact,
  keyword: string,
  kind: "keyword" | "alias" | "token",
): number {
  const base = kind === "keyword" ? 100 : kind === "alias" ? 80 : 15;
  return base + (FACT_PRIORITY_BOOST[fact.id] ?? 0);
}

function findFactMatches(fact: ScenarioFact, normalizedInput: string): FactMatch[] {
  const matches: FactMatch[] = [];
  const inputTokens = new Set(tokenizePatientText(normalizedInput));
  const blocklist = TOKEN_BLOCKLIST_BY_FACT[fact.id];
  const dialogueData = loadPatientDialogueData();
  const configuredAliases = [
    ...(dialogueData.casePack.fact_aliases[fact.id] ?? []),
    ...dialogueData.badGermanAliases.aliases
      .filter((alias) => alias.fact_id === fact.id)
      .map((alias) => alias.input),
    ...dialogueData.sttNoiseAliases.aliases
      .filter((alias) => alias.fact_id === fact.id)
      .map((alias) => alias.input),
  ];

  for (const keyword of fact.trigger_keywords) {
    const normalizedKeyword = normalizePatientText(keyword);
    if (containsNormalizedTerm(normalizedInput, normalizedKeyword)) {
      matches.push({
        fact,
        keyword,
        score: scoreMatch(fact, keyword, "keyword"),
      });
    }
  }

  for (const alias of [
    ...(FACT_QUERY_ALIASES[fact.id] ?? []),
    ...configuredAliases,
  ]) {
    const normalizedAlias = normalizePatientText(alias);
    if (containsNormalizedTerm(normalizedInput, normalizedAlias)) {
      matches.push({
        fact,
        keyword: alias,
        score: scoreMatch(fact, alias, "alias"),
      });
    }
  }

  if (matches.length === 0) {
    for (const token of tokenizePatientText(fact.answer_de)) {
      if (blocklist?.has(token)) {
        continue;
      }
      if (inputTokens.has(token)) {
        matches.push({
          fact,
          keyword: token,
          score: scoreMatch(fact, token, "token"),
        });
        break;
      }
    }
  }

  return matches;
}

export function matchScenarioFacts(
  facts: ScenarioFact[],
  normalizedInput: string,
  options: {
    preferFactIds?: string[];
    excludeFactIds?: string[];
  } = {},
): FactMatch[] {
  const prefer = new Set(options.preferFactIds ?? []);
  const exclude = new Set(options.excludeFactIds ?? []);
  const allMatches: FactMatch[] = [];

  for (const fact of facts) {
    if (exclude.has(fact.id)) {
      continue;
    }
    allMatches.push(...findFactMatches(fact, normalizedInput));
  }

  const byFact = new Map<string, FactMatch>();
  for (const match of allMatches) {
    const boost = prefer.has(match.fact.id) ? 50 : 0;
    const scored = { ...match, score: match.score + boost };
    const existing = byFact.get(match.fact.id);
    if (!existing || scored.score > existing.score) {
      byFact.set(match.fact.id, scored);
    }
  }

  return [...byFact.values()].sort((a, b) => b.score - a.score);
}
