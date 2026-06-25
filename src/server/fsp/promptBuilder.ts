import type { SessionState, SleScenario } from "./types";

export interface PatientPromptEnvelope {
  system: string;
  allowedFacts: Array<{ id: string; answerDe: string }>;
  forbiddenFactIds: string[];
}

export function buildPatientPromptEnvelope(
  session: SessionState,
  scenario: SleScenario,
): PatientPromptEnvelope {
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
    system: [
      "Du spielst eine fiktive Patientin in einer deutschen FSP-Trainingssimulation.",
      "Antworte kurz, natürlich und nur mit ausdrücklich freigegebenen Fakten.",
      "Erfinde keine medizinischen Angaben und nenne in der Patientenphase keine Laborwerte.",
      "Gib keine medizinische Beratung für reale Personen.",
      `Aktuelle Phase: ${session.phase}.`,
      `Inhaltsstatus: ${scenario.metadata.content_status}.`,
    ].join(" "),
    allowedFacts,
    forbiddenFactIds,
  };
}
