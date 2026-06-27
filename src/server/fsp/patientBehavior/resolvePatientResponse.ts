import type { FactRevealEvent, SessionState, SleScenario } from "../types";
import {
  buildBiographyResponse,
  inferRepeatBiographyIntent,
} from "./biographyResponses";
import {
  isDermatologistCollisionQuestion,
  isGpQuestion,
  isPartialGpSttFragment,
} from "./gpQuestion";
import {
  detectQuestionQualities,
  getExaminerOnlyIntent,
  getVagueClarifyKey,
  inferBiographyIntent,
  inferFamilyIntent,
  inferSubstanceIntent,
  isBroadQuestion,
  isChiefComplaintOpenerQuestion,
  isJargonQuestion,
  isLeadingQuestion,
  isRaynaudColorQuestion,
  resolveUniversalDialogueIntent,
} from "./classifyQuestion";
import { buildFocusedFactResponse } from "./focusedFactResponse";
import {
  isImperfectLabSttQuestion,
  isLikelyMisunderstoodQuestion,
  isUnclearTruncatedQuestion,
  REPEAT_QUESTION_CLARIFY_DE,
} from "./imperfectSttRecovery";
import { isRepeatRequest, WHAT_TO_REPEAT_CLARIFY_DE } from "./repeatRequest";
import { matchScenarioFacts } from "./factMatcher";
import { loadPatientDialogueData } from "./dialogueData";
import { normalizePatientText } from "./normalize";
import type { PatientBehaviorResolution, ResponseClass } from "./types";

const CLARIFY_TEMPLATES: Record<string, string> = {
  family:
    "Meinen Sie, mit wem ich zusammenlebe, oder Krankheiten in meiner Familie?",
  substances: "Meinen Sie Medikamente, Alkohol oder Drogen?",
  alcohol: "Meinen Sie Alkohol?",
};

const SALIENT_BROAD_FACT_IDS = [
  "timeline_weeks",
  "joint_pain_pattern",
];

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
  const configuredBlock = loadPatientDialogueData().examinerOnlyBlocks.blocks.find(
    (block) => block.intent === intent,
  );
  if (configuredBlock) {
    return {
      responseDe: configuredBlock.response_de,
      responseClass: "examiner_only_block",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: configuredBlock.id,
      fallbackReason: null,
      intent,
      questionQuality: ["examiner_only"],
    };
  }

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
    matchedFactId: null,
    matchedAliasId: null,
    fallbackReason: null,
    intent,
    questionQuality: ["examiner_only"],
  };
}

export function resolvePatientResponse(
  input: string,
  session: SessionState,
  scenario: SleScenario,
  options: {
    conversationLastAssistantDe?: string | null;
  } = {},
): PatientBehaviorResolution {
  const normalizedInput = normalizePatientText(input);
  const questionQuality = detectQuestionQualities(input);
  const priorAnswer =
    session.lastPatientResponseDe ?? options.conversationLastAssistantDe ?? null;

  const resolveRepeat = (): PatientBehaviorResolution | null => {
    if (!isRepeatRequest(input)) {
      return null;
    }
    if (priorAnswer) {
      return {
        responseDe: priorAnswer,
        responseClass: "neutral_default",
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        matchedFactId: null,
        matchedAliasId: "message_history.last_assistant",
        fallbackReason: null,
        intent: "patient.repeat",
        questionQuality,
      };
    }
    const repeatTarget = inferRepeatBiographyIntent(input);
    if (repeatTarget) {
      const bio = buildBiographyResponse(repeatTarget, scenario, input);
      return {
        responseDe: bio.responseDe,
        responseClass: bio.responseClass,
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        matchedFactId: null,
        matchedAliasId: repeatTarget,
        fallbackReason: null,
        intent: "patient.repeat",
        questionQuality,
      };
    }
    return {
      responseDe: WHAT_TO_REPEAT_CLARIFY_DE,
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: null,
      fallbackReason: "no_repeatable_answer",
      intent: "patient.repeat.clarify",
      questionQuality,
    };
  };

  const universal = resolveUniversalDialogueIntent(input);
  if (universal && universal.intent !== "dialogue.repeat_or_clarify") {
    return {
      responseDe: universal.responseDe,
      responseClass: universal.responseClass,
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: universal.matchedAliasId,
      fallbackReason: null,
      intent: universal.intent,
      questionQuality,
    };
  }

  if (isImperfectLabSttQuestion(input)) {
    const factMatches = matchScenarioFacts(scenario.facts, normalizedInput);
    const blocked = factMatches.filter(
      (match) =>
        match.fact.visibility === "examiner_only" ||
        !match.fact.allowed_phases.includes(session.phase),
    );
    const resolution = resolveExaminerBlock(scenario, "laboratory");
    resolution.blockedFactIds = blocked.map((entry) => entry.fact.id);
    resolution.matchedKeywords = blocked.map((entry) => entry.keyword);
    return resolution;
  }

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
      matchedFactId: null,
      matchedAliasId: null,
      fallbackReason: "medical_jargon_without_lay_context",
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
      matchedFactId: null,
      matchedAliasId: vagueKey,
      fallbackReason: null,
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
      matchedFactId: null,
      matchedAliasId: null,
      fallbackReason: null,
      intent: "ambiguous.substances",
      questionQuality,
    };
  }

  const repeatResolution = resolveRepeat();
  if (repeatResolution) {
    return repeatResolution;
  }

  if (isPartialGpSttFragment(input)) {
    return {
      responseDe: "Meinen Sie meinen Hausarzt?",
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: "gp.partial",
      fallbackReason: null,
      intent: "clarify.gp",
      questionQuality,
    };
  }

  if (isDermatologistCollisionQuestion(input)) {
    return {
      responseDe: "Meinen Sie meinen Hausarzt oder einen Hautarzt?",
      responseClass: "clarify",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: "clarify.hautarzt_collision",
      fallbackReason: null,
      intent: "clarify.hautarzt_collision",
      questionQuality,
    };
  }

  if (isGpQuestion(input)) {
    const gp = buildBiographyResponse("biography.gp", scenario, input);
    return {
      responseDe: gp.responseDe,
      responseClass: gp.responseClass,
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: "biography.gp",
      fallbackReason: null,
      intent: "biography.gp",
      questionQuality,
    };
  }

  const bioIntent = inferBiographyIntent(input);
  if (bioIntent) {
    const bio = buildBiographyResponse(bioIntent, scenario, input);
    return {
      responseDe: bio.responseDe,
      responseClass: bio.responseClass,
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: bioIntent,
      fallbackReason: null,
      intent: bioIntent,
      questionQuality,
    };
  }

  if (isChiefComplaintOpenerQuestion(input)) {
    return {
      responseDe: scenario.opening.statement_de,
      responseClass: "case_positive",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: "chief_complaint.opener",
      fallbackReason: null,
      intent: "chief_complaint.opener",
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
      matchedFactId: null,
      matchedAliasId: "broad.anamnesis",
      fallbackReason: null,
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
      matchedFactId: null,
      matchedAliasId: "ambiguous.family",
      fallbackReason: null,
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
  if (
    /\b(roetung|rotung|rötung|ausschlag)\b/.test(normalizedInput) &&
    /\b(gesicht|wange|nase)\b/.test(normalizedInput) &&
    !/\b(sonne|licht|sonnen)\b/.test(normalizedInput)
  ) {
    preferFactIds.push("butterfly_rash");
    excludeFactIds.push("photosensitivity");
  }
  if (isGpQuestion(input)) {
    excludeFactIds.push("family_status");
  }

  const factMatches = matchScenarioFacts(scenario.facts, normalizedInput, {
    preferFactIds,
    excludeFactIds,
  });

  if (factMatches.length === 0) {
    if (isImperfectLabSttQuestion(input)) {
      return resolveExaminerBlock(scenario, "laboratory");
    }
    if (/\b(stress|sorgen|erwartung|befurcht|befuercht|angst)\b/.test(normalizedInput)) {
      return {
        responseDe:
          "Ich mache mir Sorgen, dass etwas Ernstes dahintersteckt, und möchte wissen, woher das kommt.",
        responseClass: "neutral_default",
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        matchedFactId: null,
        matchedAliasId: "concerns",
        fallbackReason: null,
        intent: "concerns",
        questionQuality,
      };
    }
    if (isUnclearTruncatedQuestion(input)) {
      return {
        responseDe: REPEAT_QUESTION_CLARIFY_DE,
        responseClass: "clarify",
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        matchedFactId: null,
        matchedAliasId: null,
        fallbackReason: "unclear_truncated_question",
        intent: "unclear.repeat",
        questionQuality,
      };
    }
    if (isLikelyMisunderstoodQuestion(input)) {
      return {
        responseDe: REPEAT_QUESTION_CLARIFY_DE,
        responseClass: "clarify",
        revealedFactIds: [],
        blockedFactIds: [],
        matchedKeywords: [],
        matchedFactId: null,
        matchedAliasId: null,
        fallbackReason: "likely_misunderstood_question",
        intent: "unclear.repeat",
        questionQuality,
      };
    }
    return {
      responseDe: scenario.fallbacks.unknown_de,
      responseClass: "patient_unknown",
      revealedFactIds: [],
      blockedFactIds: [],
      matchedKeywords: [],
      matchedFactId: null,
      matchedAliasId: null,
      fallbackReason: "no_dialogue_match",
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

  let surfaced = allowed.slice(0, 1);

  if (isLeadingQuestion(input) && surfaced.length > 0) {
    const negated = surfaced.find((m) =>
      /^nein|kein|keine|nicht/.test(m.fact.answer_de.trim().toLowerCase()),
    );
    if (negated) {
      surfaced = [negated];
    }
  }

  const newlyRevealed = applyFactReveal(session, surfaced);

  const responseDe = buildFocusedFactResponse(surfaced[0].fact, input);
  const hasNegative = isNegativePatientAnswer(responseDe);
  const responseClass: ResponseClass = hasNegative
    ? "case_negative"
    : "case_positive";

  return {
    responseDe,
    responseClass,
    revealedFactIds: newlyRevealed,
    blockedFactIds: blocked.map((entry) => entry.fact.id),
    matchedKeywords: [...surfaced, ...blocked].map((entry) => entry.keyword),
    matchedFactId: surfaced[0]?.fact.id ?? null,
    matchedAliasId: surfaced[0]?.keyword ?? null,
    fallbackReason: null,
    intent: surfaced[0]?.fact.category ?? null,
    questionQuality,
  };
}

function isNegativePatientAnswer(responseDe: string): boolean {
  const normalized = responseDe.trim().toLocaleLowerCase("de-DE");
  if (/^(nein|kein|keine|keinen|keinem|keiner)\b/.test(normalized)) {
    return true;
  }
  if (/^(ich rauche nicht|schwanger bin ich nicht)\b/.test(normalized)) {
    return true;
  }
  if (!normalized.startsWith("ja") && /\b(keine|keinen|nicht)\b/.test(normalized)) {
    return true;
  }
  return false;
}
