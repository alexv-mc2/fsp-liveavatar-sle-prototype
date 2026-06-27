import {
  inferBiographyIntent,
  inferSubstanceIntent,
  isDejargonizedLabResultQuestion,
} from "./classifyQuestion";
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
  return false;
}
