import {
  inferBiographyIntent,
  inferSubstanceIntent,
  isDejargonizedLabResultQuestion,
} from "./classifyQuestion";
import { isRepeatRequest } from "./repeatRequest";
import { normalizePatientText } from "./normalize";

export const REPEAT_QUESTION_CLARIFY_DE =
  "Entschuldigung, können Sie die Frage bitte wiederholen?";

const IMPERFECT_ANA_TITER_PATTERNS = [
  /\ba1[- ]?titer\b/,
  /\banatiter\b/,
  /\bana\s+titer\b/,
  /\bana[- ]titer\b/,
];

const STANDALONE_LAB_FRAGMENT =
  /^(titer|blutwert|befund|wert|laborwert|werte|befunde|ergebnis|resultat)\??$/;

const TRUNCATED_QUESTION_PATTERNS = [
  /^wie hoch ist$/,
  /^wie hoch$/,
  /^wie ist$/,
  /^was ist$/,
  /^haben sie$/,
];

/** Corrupted or fragmentary lab-value STT (imperfect learner German). */
export function isImperfectLabSttQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  if (STANDALONE_LAB_FRAGMENT.test(normalized)) {
    return true;
  }
  if (IMPERFECT_ANA_TITER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (/\b(a1|ana)\b/.test(normalized) && /\btiter\b/.test(normalized)) {
    return true;
  }
  if (/\bblutwert\b/.test(normalized)) {
    return true;
  }
  if (
    /\btiter\b/.test(normalized) &&
    (normalized.includes("?") ||
      /\b(wie hoch|was ist|ihr|der|mit dem|mit der)\b/.test(normalized))
  ) {
    return true;
  }
  return isDejargonizedLabResultQuestion(input);
}

/** Truncated or incomplete question — ask for repetition before unknown fallback. */
export function isUnclearTruncatedQuestion(input: string): boolean {
  const normalized = normalizePatientText(input).trim();
  if (isRepeatRequest(input)) {
    return false;
  }
  if (TRUNCATED_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (inferBiographyIntent(input) || inferSubstanceIntent(input)) {
    return false;
  }
  if (isImperfectLabSttQuestion(input)) {
    return false;
  }
  if (normalized.length <= 14 && /^(wie|was|haben)\b/.test(normalized)) {
    if (/\b(alt|name|drogen|medikament|schmerz|beschwerd)\b/.test(normalized)) {
      return false;
    }
    return true;
  }
  if (normalized.length <= 22 && /^(wie|was|haben|ist|mein)\b/.test(normalized)) {
    if (/\b(alt|name|geboren|gewicht|gross|groesse|hausarzt|haus arzt)\b/.test(normalized)) {
      return false;
    }
    return true;
  }
  return false;
}

/** True when the question is too vague to answer but not a knowable patient fact gap. */
export function isLikelyMisunderstoodQuestion(input: string): boolean {
  if (isRepeatRequest(input)) {
    return false;
  }
  const normalized = normalizePatientText(input).trim();
  if (normalized.length === 0) {
    return true;
  }
  if (isUnclearTruncatedQuestion(input)) {
    return true;
  }
  if (/^(wie|was|haben sie|ist das)\b/.test(normalized) && normalized.length <= 28) {
    if (inferBiographyIntent(input) || inferSubstanceIntent(input)) {
      return false;
    }
    const tokenCount = normalized.split(" ").length;
    if (tokenCount <= 4) {
      return true;
    }
  }
  return false;
}
