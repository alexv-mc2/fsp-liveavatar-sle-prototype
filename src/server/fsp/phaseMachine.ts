import type { FspPhase, SessionState, SleScenario } from "./types";
import { InMemorySessionStore } from "./scenarioState";

const ALLOWED_TRANSITIONS: Record<FspPhase, readonly FspPhase[]> = {
  session_start: ["patient_opening"],
  patient_opening: ["anamnesis_active"],
  anamnesis_active: ["patient_questions", "documentation_phase"],
  patient_questions: ["documentation_phase"],
  documentation_phase: ["lab_call_phase", "doctor_handover_phase"],
  lab_call_phase: ["doctor_handover_phase"],
  doctor_handover_phase: ["feedback_phase"],
  feedback_phase: ["session_end"],
  session_end: [],
};

export class InvalidPhaseTransitionError extends Error {
  constructor(from: FspPhase, to: FspPhase) {
    super(`Invalid phase transition: ${from} -> ${to}`);
    this.name = "InvalidPhaseTransitionError";
  }
}

export function canTransition(from: FspPhase, to: FspPhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionPhase(
  session: SessionState,
  nextPhase: FspPhase,
  scenario: SleScenario,
  store: InMemorySessionStore,
): SessionState {
  if (!canTransition(session.phase, nextPhase)) {
    throw new InvalidPhaseTransitionError(session.phase, nextPhase);
  }

  session.phase = nextPhase;
  session.updatedAt = new Date().toISOString();

  if (nextPhase === "patient_questions") {
    const question = scenario.patient_questions[0];
    session.patientQuestionIndex = 1;
    store.appendTurn(session, "assistant", question, "phase_machine");
  }

  if (nextPhase === "documentation_phase") {
    store.appendTurn(
      session,
      "system",
      "Die Patienteninteraktion ist pausiert. Bitte dokumentieren Sie den Fall.",
      "phase_machine",
    );
  }

  if (nextPhase === "lab_call_phase") {
    store.appendTurn(
      session,
      "system",
      "Laborphase (RECONCILED_V1): fiktionale Befunde mit Provenienzlabels [PDF], [VERIFIED], [PROTOTYPE], [INFERENCE], [REVIEW]; Klassifikation ≠ Diagnose.",
      "phase_machine",
    );
  }

  if (nextPhase === "doctor_handover_phase") {
    store.appendTurn(
      session,
      "system",
      "Bitte stellen Sie die Patientin jetzt strukturiert im Arzt-Arzt-Gespräch vor.",
      "phase_machine",
    );
  }

  if (nextPhase === "feedback_phase") {
    store.appendTurn(
      session,
      "system",
      "Die interne Trainingsauswertung wird erstellt. Sie ist keine offizielle Prüfungsbewertung.",
      "feedback",
    );
  }

  if (nextPhase === "session_end") {
    session.endedAt = new Date().toISOString();
  }

  return session;
}

export function isPatientConversationPhase(phase: FspPhase): boolean {
  return ["patient_opening", "anamnesis_active", "patient_questions"].includes(
    phase,
  );
}
