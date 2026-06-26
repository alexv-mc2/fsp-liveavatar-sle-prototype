import type { SessionState, SleScenario } from "./types";
import {
  buildAuthoritativeScenarioContext,
  type AuthoritativeScenarioContext,
} from "./scenarioContextLoader";
import type { ParsedChatMessage } from "../integrations/customLlm/messageExtraction";

export interface PatientPromptEnvelope {
  system: string;
  allowedFacts: Array<{ id: string; answerDe: string }>;
  forbiddenFactIds: string[];
}

export function buildAuthoritativePatientContext(
  scenario: SleScenario,
  messages: ParsedChatMessage[],
): AuthoritativeScenarioContext {
  return buildAuthoritativeScenarioContext(scenario, messages);
}

export function buildPatientPromptEnvelope(
  session: SessionState,
  scenario: SleScenario,
  messages: ParsedChatMessage[] = [],
): PatientPromptEnvelope {
  const context = buildAuthoritativeScenarioContext(scenario, messages);
  const allowedFacts = scenario.facts
    .filter(
      (fact) =>
        fact.visibility !== "examiner_only" &&
        fact.allowed_phases.includes(session.phase) &&
        session.revealedFactIds.has(fact.id),
    )
    .map((fact) => ({ id: fact.id, answerDe: fact.answer_de }));

  const forbiddenFactIds = scenario.facts
    .filter(
      (fact) =>
        fact.visibility === "examiner_only" ||
        !fact.allowed_phases.includes(session.phase) ||
        !session.revealedFactIds.has(fact.id),
    )
    .map((fact) => fact.id);

  return {
    system: context.systemPromptDe,
    allowedFacts,
    forbiddenFactIds,
  };
}
