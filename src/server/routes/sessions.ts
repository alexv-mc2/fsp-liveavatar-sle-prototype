import { calculateTrainingFeedback } from "../fsp/scoring";
import {
  transitionPhase,
  type InvalidPhaseTransitionError,
} from "../fsp/phaseMachine";
import { loadScenario } from "../fsp/scenarioLoader";
import {
  InMemorySessionStore,
  sessionStore,
} from "../fsp/scenarioState";
import type { FspPhase, SleScenario } from "../fsp/types";

export interface SessionServiceOptions {
  store?: InMemorySessionStore;
  scenario?: SleScenario;
}

function dependencies(options: SessionServiceOptions = {}) {
  return {
    store: options.store ?? sessionStore,
    scenario: options.scenario ?? loadScenario(),
  };
}

export function createSession(options: SessionServiceOptions = {}) {
  const { store, scenario } = dependencies(options);
  return store.serialize(store.create(scenario));
}

export function getSession(
  sessionId: string,
  options: SessionServiceOptions = {},
) {
  const { store } = dependencies(options);
  return store.serialize(store.require(sessionId));
}

export function resetSession(
  sessionId: string,
  options: SessionServiceOptions = {},
) {
  const { store, scenario } = dependencies(options);
  return store.serialize(store.reset(sessionId, scenario));
}

export function setSessionPhase(
  sessionId: string,
  phase: FspPhase,
  options: SessionServiceOptions = {},
) {
  const { store, scenario } = dependencies(options);
  const session = store.require(sessionId);
  transitionPhase(session, phase, scenario, store);
  return store.serialize(session);
}

export function generateFeedback(
  sessionId: string,
  options: SessionServiceOptions = {},
) {
  const { store, scenario } = dependencies(options);
  const session = store.require(sessionId);

  if (session.phase === "doctor_handover_phase") {
    transitionPhase(session, "feedback_phase", scenario, store);
  }

  return {
    session: store.serialize(session),
    feedback: calculateTrainingFeedback(session, scenario),
  };
}

export type { InvalidPhaseTransitionError };
