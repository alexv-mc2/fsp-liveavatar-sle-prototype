import type { ScenarioFact } from "../types";

export const RESPONSE_CLASSES = [
  "case_positive",
  "case_negative",
  "neutral_default",
  "clarify",
  "patient_unknown",
  "examiner_only_block",
] as const;

export type ResponseClass = (typeof RESPONSE_CLASSES)[number];

export type QuestionQuality =
  | "specific"
  | "broad"
  | "vague"
  | "leading"
  | "jargon"
  | "examiner_only";

export interface PatientBehaviorResolution {
  responseDe: string;
  responseClass: ResponseClass;
  revealedFactIds: string[];
  blockedFactIds: string[];
  matchedKeywords: string[];
  matchedFactId?: string | null;
  matchedAliasId?: string | null;
  fallbackReason?: string | null;
  intent: string | null;
  questionQuality: QuestionQuality[];
}

export type FactMatch = {
  fact: ScenarioFact;
  keyword: string;
  score: number;
};
