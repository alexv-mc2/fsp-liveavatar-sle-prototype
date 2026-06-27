import type { SessionState, SleScenario } from "./types";
import { resolvePatientResponse } from "./patientBehavior/resolvePatientResponse";
import type { PatientBehaviorResolution } from "./patientBehavior/types";

export interface HiddenFactResolution {
  responseDe: string;
  revealedFactIds: string[];
  blockedFactIds: string[];
  matchedKeywords: string[];
  behavior?: PatientBehaviorResolution;
}

export function resolveHiddenFacts(
  input: string,
  session: SessionState,
  scenario: SleScenario,
  options: {
    conversationLastAssistantDe?: string | null;
  } = {},
): HiddenFactResolution {
  const behavior = resolvePatientResponse(input, session, scenario, options);
  return {
    responseDe: behavior.responseDe,
    revealedFactIds: behavior.revealedFactIds,
    blockedFactIds: behavior.blockedFactIds,
    matchedKeywords: behavior.matchedKeywords,
    behavior,
  };
}

export { resolvePatientResponse } from "./patientBehavior/resolvePatientResponse";
export type {
  PatientBehaviorResolution,
  ResponseClass,
} from "./patientBehavior/types";
