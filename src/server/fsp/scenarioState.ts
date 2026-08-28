import { randomUUID } from "node:crypto";
import type {
  SerializedSessionState,
  SessionState,
  SleScenario,
  TranscriptSource,
} from "./types";

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class InMemorySessionStore {
  private readonly sessions = new Map<string, SessionState>();

  create(scenario: SleScenario): SessionState {
    const now = new Date().toISOString();
    const session: SessionState = {
      id: randomUUID(),
      caseId: scenario.metadata.id,
      phase: "patient_opening",
      revealedFactIds: new Set(),
      askedChecklistItems: new Set(),
      transcriptTurns: [],
      factRevealEvents: [],
      safetyFlags: [],
      patientQuestionIndex: 0,
      lastPatientResponseDe: null,
      startedAt: now,
      updatedAt: now,
    };

    this.appendTurn(
      session,
      "assistant",
      scenario.opening.statement_de,
      "opening",
    );
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  require(sessionId: string): SessionState {
    const session = this.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  reset(sessionId: string, scenario: SleScenario): SessionState {
    const existing = this.require(sessionId);
    const now = new Date().toISOString();

    existing.phase = "patient_opening";
    existing.revealedFactIds.clear();
    existing.askedChecklistItems.clear();
    existing.transcriptTurns = [];
    existing.factRevealEvents = [];
    existing.safetyFlags = [];
    existing.patientQuestionIndex = 0;
    existing.lastPatientResponseDe = null;
    existing.startedAt = now;
    existing.updatedAt = now;
    existing.endedAt = undefined;

    this.appendTurn(
      existing,
      "assistant",
      scenario.opening.statement_de,
      "opening",
    );

    return existing;
  }

  appendTurn(
    session: SessionState,
    role: "user" | "assistant" | "system",
    content: string,
    source: TranscriptSource,
  ): void {
    const now = new Date().toISOString();
    session.transcriptTurns.push({
      id: randomUUID(),
      role,
      content,
      phase: session.phase,
      source,
      timestamp: now,
    });
    session.updatedAt = now;
  }

  serialize(session: SessionState): SerializedSessionState {
    return {
      id: session.id,
      caseId: session.caseId,
      phase: session.phase,
      revealedFactIds: [...session.revealedFactIds],
      askedChecklistItems: [...session.askedChecklistItems],
      transcriptTurns: session.transcriptTurns.map((turn) => ({ ...turn })),
      factRevealEvents: session.factRevealEvents.map((event) => ({ ...event })),
      safetyFlags: [...session.safetyFlags],
      patientQuestionIndex: session.patientQuestionIndex,
      lastPatientResponseDe: session.lastPatientResponseDe,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      endedAt: session.endedAt,
    };
  }

  clear(): void {
    this.sessions.clear();
  }
}

const globalSessionStore = globalThis as typeof globalThis & {
  __fspSleSessionStore?: InMemorySessionStore;
};

// A global singleton keeps the in-memory prototype state shared across Next.js
// route bundles and development hot reloads in one local Node process.
export const sessionStore =
  globalSessionStore.__fspSleSessionStore ?? new InMemorySessionStore();

globalSessionStore.__fspSleSessionStore = sessionStore;
