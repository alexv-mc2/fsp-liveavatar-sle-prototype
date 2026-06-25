"use client";

import { useState } from "react";
import type {
  ClientSession,
  ClientTrainingFeedback,
  FspPhase,
} from "@/lib/clientTypes";
import { DisclaimerConsent } from "./DisclaimerConsent";
import { DocumentationForm } from "./DocumentationForm";
import { FeedbackReport } from "./FeedbackReport";
import { HandoverForm } from "./HandoverForm";
import { LabCallPlaceholder } from "./LabCallPlaceholder";
import { PatientSimulationPanel } from "./PatientSimulationPanel";
import { PhaseIndicator } from "./PhaseIndicator";
import { TranscriptPanel } from "./TranscriptPanel";

interface ApiErrorBody {
  error?: { message?: string };
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Die lokale API-Anfrage ist fehlgeschlagen.");
  }
  return body;
}

function nextPhaseAction(phase: FspPhase): { label: string; phase: FspPhase } | null {
  switch (phase) {
    case "patient_opening":
      return { label: "Anamnese beginnen", phase: "anamnesis_active" };
    case "anamnesis_active":
      return { label: "Zu den Patientenfragen", phase: "patient_questions" };
    case "patient_questions":
      return { label: "Zur Dokumentation", phase: "documentation_phase" };
    case "documentation_phase":
      return { label: "Zum Laboranruf", phase: "lab_call_phase" };
    case "lab_call_phase":
      return { label: "Zur Arzt-Arzt-Übergabe", phase: "doctor_handover_phase" };
    default:
      return null;
  }
}

export function SimulationWorkspace() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [feedback, setFeedback] = useState<ClientTrainingFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setBusy(true);
    setError(null);
    try {
      const body = await parseOrThrow<{ session: ClientSession }>(
        await fetch("/api/sessions", { method: "POST" }),
      );
      setSession(body.session);
      setFeedback(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sitzung konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(phase: FspPhase) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const body = await parseOrThrow<{ session: ClientSession }>(
        await fetch(`/api/sessions/${session.id}/phase`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phase }),
        }),
      );
      setSession(body.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Phase konnte nicht gewechselt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text: string) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const body = await parseOrThrow<{
        choices: Array<{ message: { content: string } }>;
        x_fsp: { session: ClientSession };
      }>(
        await fetch("/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-fsp-session-id": session.id,
          },
          body: JSON.stringify({
            model: "fsp-sle-deterministic-mock-v0",
            messages: [{ role: "user", content: text }],
          }),
        }),
      );
      setSession(body.x_fsp.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nachricht konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const body = await parseOrThrow<{ session: ClientSession }>(
        await fetch(`/api/sessions/${session.id}/reset`, { method: "POST" }),
      );
      setSession(body.session);
      setFeedback(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sitzung konnte nicht zurückgesetzt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function generateFeedback() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const body = await parseOrThrow<{
        session: ClientSession;
        feedback: ClientTrainingFeedback;
      }>(
        await fetch(`/api/sessions/${session.id}/feedback`, { method: "POST" }),
      );
      setSession(body.session);
      setFeedback(body.feedback);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <DisclaimerConsent onConfirm={startSession} busy={busy} error={error} />;
  }

  const nextAction = nextPhaseAction(session.phase);

  return (
    <main className="simulation-shell">
      <header className="simulation-header">
        <div>
          <div className="eyebrow">NRW / Düsseldorf · unabhängiges FSP-Training</div>
          <h1>SLE-Einzelfallsimulation</h1>
          <p>
            Ärztekammer-Nordrhein-Kontext · Approbationsweg über ZAG Münster · keine offizielle Anerkennung
          </p>
        </div>
        <div className="header-actions">
          <span className="status-pill status-mock">lokal · In-Memory</span>
          <button className="button button-secondary" type="button" onClick={() => void reset()} disabled={busy}>
            Sitzung zurücksetzen
          </button>
        </div>
      </header>

      <PhaseIndicator phase={session.phase} />

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="simulation-grid">
        <PatientSimulationPanel phase={session.phase} busy={busy} onSend={sendMessage} />
        <TranscriptPanel turns={session.transcriptTurns} />
      </div>

      {session.phase === "documentation_phase" ? <DocumentationForm /> : null}
      {session.phase === "lab_call_phase" ? <LabCallPlaceholder /> : null}
      {session.phase === "doctor_handover_phase" ? <HandoverForm /> : null}
      {session.phase === "feedback_phase" ? <FeedbackReport feedback={feedback} /> : null}

      <footer className="simulation-controls">
        <div className="session-meta">
          <span>Session {session.id.slice(0, 8)}</span>
          <span>{session.revealedFactIds.length} Fakten freigegeben</span>
          <span>{session.safetyFlags.length} Safety-Flags</span>
        </div>
        <div className="control-actions">
          {nextAction ? (
            <button
              className="button button-primary"
              type="button"
              disabled={busy}
              onClick={() => void transition(nextAction.phase)}
            >
              {nextAction.label}
            </button>
          ) : null}
          {session.phase === "doctor_handover_phase" ? (
            <button
              className="button button-primary"
              type="button"
              disabled={busy}
              onClick={() => void generateFeedback()}
            >
              Trainingsfeedback erzeugen
            </button>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
