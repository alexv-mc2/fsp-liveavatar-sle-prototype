import type { FactRevealEvent, SessionState, SleScenario } from "../types";
import {
  detectQuestionQualities,
  getExaminerOnlyIntent,
  getVagueClarifyKey,
  inferBiographyIntent,
  inferFamilyIntent,
  inferSubstanceIntent,
  isBroadQuestion,
  isJargonQuestion,
  isLeadingQuestion,
  isRaynaudColorQuestion,
} from "./classifyQuestion";
import { matchScenarioFacts } from "./factMatcher";
import { normalizePatientText } from "./normalize";
import type { PatientBehaviorResolution, ResponseClass } from "./types";

const CLARIFY_TEMPLATES: Record<string, string> = {
  family:
    "Meinen Sie, mit wem ich zusammenlebe, oder Krankheiten in meiner Familie?",
  substances: "Meinen Sie Medikamente, Alkohol oder Drogen?",
  alcohol: "Meinen Sie Alkohol?",
};

const SALIENT_BROAD_FACT_IDS = [
  "chief_fatigue",
  "timeline_weeks",
  "joint_pain_pattern",
  "butterfly_rash",
  "photosensitivity",
];

function buildBiographyResponse(
  intent: string,
  scenario: SleScenario,
): { responseDe: string; responseClass: ResponseClass } {
  const { patient } = scenario;
  if (intent === "biography.name") {
    const name = patient.display_name.replace(/^Frau\s+/i, "").trim();
    return {
      responseDe: `Ich heiße ${name}.`,
      responseClass: "neutral_default",
    };
  }
  if (intent === "biography.age") {
    return {
      responseDe: `Ich bin ${patient.age_years} Jahre alt.`,
      responseClass: "neutral_default",
    };
  }
  if (intent === "biography.occupation") {
    return {
      responseDe: `Ich arbeite als ${patient.occupation_de}.`,
      responseClass: "neutral_default",
    };
  }
  return {
    responseDe: scenario.fallbacks.unknown_de,
    responseClass: "patient_unknown",
  };
}

function buildBroadResponse(
  scenario: SleScenario,
  session: SessionState,
): string {
  if (session.revealedFactIds.size === 0) {
    return scenario.opening.statement_de;
  }
  const unrevealed = SALIENT_BROAD_FACT_IDS.filter(
    (id) => !session.revealedFactIds.has(id),
  );
  const facts = unrevealed
    .map((id) => scenario.facts.find((fact) => fact.id === id))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
    .slice(0, 2);
  if (facts.length === 0) {
    return "Mehr fällt mir gerade nicht ein. Das Hauptproblem sind wirklich die Beschwerden seit ein paar Wochen.";
  }
  return facts.map((fact) => fact.answer_de).join(" ");
}

function applyFactReveal(
  session: SessionState,
  matches: Array<{ fact: { id: string; checklist_item?: string }; keyword: string }>,
): string[] {
  const now = new Date().toISOString();
  const newlyRevealed: string[] = [];

  for (const { fact, keyword } of matches) {
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
  return newlyRevealed;
}

function resolveExaminerBlock(
  scenario: SleScenario,
  intent: string | null,
): PatientBehaviorResolution {
  const asksForClassification = intent === "classification";
  const asksForLab = intent === "laboratory" || intent === "examiner.physical";
  const responseDe = asksForClassification
    ? (scenario.fallbacks.classification_in_patient_phase_de ??
        scenario.fallbacks.lab_in_patient_phase_de)
    : asksForLab
      ? scenario.fallbacks.lab_in_patient_phase_de
      : intent === "diagnosis.hidden"
        ? "Das wurde mir bisher nicht gesagt. Ich weiß nur, dass die Beschwerden abgeklärt werden sollen."
        : scenario.fallbacks.examiner_only_de;

  return {
    responseDe,
    responseClass: "examiner_only_block",
    revealedFactIds: [],
    blockedFactIds: [],
    matchedKeywords: [],
    intent,
    questionQuality: ["examiner_only"],
  };
}

export function resolvePatientResponse(
  input: string,
  session: SessionState,
  scenario: SleScenario,
): PatientBehaviorResolution {
  const normalizedInput = normalizePatientText(input);
  const questionQuality = detectQuestionQualities(input);
  const examinerIntent = getExaminerOnlyIntent(input);

  if (examinerIntent) {
    const factMatches = matchScenarioFacts(scenario.facts, normalizedInput);
    const blocked = factMatches.filter(
      (match) =>
        match.fact.visibility === "examiner_only" ||
        !match.fact.allowed_phases.includes(session.phase),
    );
    const resolution = resolveExaminerBlock(scenario, examinerIntent);
    resolution.blockedFactIds = blocked.map((entry) => entry.fact.id);
    resolution.matchedKeywords = blocked.map((entry) => entry.keyword);
    return resolution;
  }

  if (isJargonQuestion(input) && !/\b(gelenk|schmerz|sonne|haut)\b/.test(normalizedInput)) {
    return {
      responseDe:
        "Das Wort kenne ich nicht. Können Sie das bitte einfacher sagen?",
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: "jargon",
      questionQuality,
    };
  }

  const vagueKey = getVagueClarifyKey(input);
  if (vagueKey && CLARIFY_TEMPLATES[vagueKey]) {
    return {
      responseDe: CLARIFY_TEMPLATES[vagueKey],
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: `ambiguous.${vagueKey}`,
      questionQuality,
    };
  }

  const substanceIntent = inferSubstanceIntent(input);
  if (substanceIntent === "ambiguous") {
    return {
      responseDe: CLARIFY_TEMPLATES.substances,
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: "ambiguous.substances",
      questionQuality,
    };
  }

  const bioIntent = inferBiographyIntent(input);
  if (bioIntent) {
    const bio = buildBiographyResponse(bioIntent, scenario);
    return {
      responseDe: bio.responseDe,
      responseClass: bio.responseClass,
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: bioIntent,
      questionQuality,
    };
  }

  if (isBroadQuestion(input)) {
    const responseDe = buildBroadResponse(scenario, session);
    return {
      responseDe,
      responseClass: "case_positive",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: "broad.anamnesis",
      questionQuality,
    };
  }

  const familyIntent = inferFamilyIntent(input);
  if (familyIntent === "ambiguous") {
    return {
      responseDe: CLARIFY_TEMPLATES.family,
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: "ambiguous.family",
      questionQuality,
    };
  }

  const preferFactIds: string[] = [];
  const excludeFactIds: string[] = [];
  if (familyIntent === "history") {
    preferFactIds.push("family_history");
    excludeFactIds.push("family_status");
  } else if (familyIntent === "status") {
    preferFactIds.push("family_status");
  }
  if (substanceIntent === "medications") {
    preferFactIds.push("medication_ibuprofen");
    excludeFactIds.push("drugs_none");
  } else if (substanceIntent === "drugs") {
    preferFactIds.push("drugs_none");
    excludeFactIds.push("medication_ibuprofen");
  } else if (substanceIntent === "alcohol") {
    preferFactIds.push("alcohol_occasional");
  }
  if (isRaynaudColorQuestion(input)) {
    preferFactIds.push("raynaud_negative");
    excludeFactIds.push("joint_pain_pattern");
  }

  const factMatches = matchScenarioFacts(scenario.facts, normalizedInput, {
    preferFactIds,
    excludeFactIds,
  });

  if (factMatches.length === 0) {
    if (/\b(stress|sorgen|erwartung|befurcht|angst)\b/.test(normalizedInput)) {
      return {
        responseDe:
          "Ich mache mir Sorgen, dass etwas Ernstes dahintersteckt, und möchte wissen, woher das kommt.",
        responseClass: "neutral_default",
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        intent: "concerns",
        questionQuality,
      };
    }
    return {
      responseDe: scenario.fallbacks.unknown_de,
      responseClass: "patient_unknown",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      intent: null,
      questionQuality,
    };
  }

  const allowed: typeof factMatches = [];
  const blocked: typeof factMatches = [];

  for (const match of factMatches) {
    const phaseAllowed = match.fact.allowed_phases.includes(session.phase);
    if (match.fact.visibility === "examiner_only" || !phaseAllowed) {
      blocked.push(match);
    } else {
      allowed.push(match);
    }
  }

  if (allowed.length === 0) {
    const resolution = resolveExaminerBlock(
      scenario,
      blocked.some((b) => b.fact.category === "laboratory")
        ? "laboratory"
        : blocked.some((b) => b.fact.category === "classification")
          ? "classification"
          : "examiner.meta",
    );
    resolution.blockedFactIds = blocked.map((b) => b.fact.id);
    resolution.matchedKeywords = blocked.map((b) => b.keyword);
    return resolution;
  }

  let surfaced = allowed.slice(0, 2);

  if (isLeadingQuestion(input) && surfaced.length > 0) {
    const negated = surfaced.find((m) =>
      /^nein|kein|keine|nicht/.test(m.fact.answer_de.trim().toLowerCase()),
    );
    if (negated) {
      surfaced = [negated];
    }
  }

  const newlyRevealed = applyFactReveal(session, surfaced);

  const hasNegative = surfaced.some((m) =>
    /\b(nein|kein|keine|nicht)\b/i.test(m.fact.answer_de),
  );
  const responseClass: ResponseClass = hasNegative
    ? "case_negative"
    : "case_positive";

  return {
    responseDe: surfaced.map((entry) => entry.fact.answer_de).join(" "),
    responseClass,
    revealedFactIds: newlyRevealed,
    blockedFactIds: blocked.map((entry) => entry.fact.id),
    matchedKeywords: [...surfaced, ...blocked].map((entry) => entry.keyword),
    intent: surfaced[0]?.fact.category ?? null,
    questionQuality,
  };
}
