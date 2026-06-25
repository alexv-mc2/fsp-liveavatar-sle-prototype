import type { SessionState, TranscriptTurn } from "./types";
import type { InMemorySessionStore } from "./scenarioState";

export function appendTranscriptTurn(
  store: InMemorySessionStore,
  session: SessionState,
  role: "user" | "assistant" | "system",
  content: string,
  source: "opening" | "text_mock" | "guardrail" | "phase_machine" | "feedback",
): void {
  store.appendTurn(session, role, content, source);
}

export function getTranscript(session: SessionState): TranscriptTurn[] {
  return [...session.transcriptTurns];
}
