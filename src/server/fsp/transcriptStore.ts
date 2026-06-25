import type {
  SessionState,
  TranscriptSource,
  TranscriptTurn,
} from "./types";
import type { InMemorySessionStore } from "./scenarioState";

export function appendTranscriptTurn(
  store: InMemorySessionStore,
  session: SessionState,
  role: "user" | "assistant" | "system",
  content: string,
  source: TranscriptSource,
): void {
  store.appendTurn(session, role, content, source);
}

export function getTranscript(session: SessionState): TranscriptTurn[] {
  return [...session.transcriptTurns];
}
