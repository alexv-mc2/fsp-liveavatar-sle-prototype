"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LiveAvatarDebugPanel } from "@/components/LiveAvatarDebugPanel";
import { useFspLiveAvatarSession } from "@/hooks/useFspLiveAvatarSession";
import { isLiveAvatarDebugEnabled } from "@/lib/liveavatar/diagnosticRun";
import { getLiveAvatarReadiness } from "@/lib/liveavatar/clientApi";
import type { LiveAvatarReadiness } from "@/lib/liveavatar/clientApi";

function statusClass(tone: LiveAvatarReadiness["statusTone"]): string {
  switch (tone) {
    case "live":
      return "status-pill status-live";
    case "pending":
      return "status-pill status-pending";
    case "error":
      return "status-pill status-error";
    case "mock":
      return "status-pill status-mock";
    default:
      return "status-pill";
  }
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function interactivityLabel(mode: "PUSH_TO_TALK" | "CONVERSATIONAL"): string {
  return mode === "CONVERSATIONAL" ? "Konversation" : "Push-to-Talk";
}

export function LiveAvatarPracticePanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    uiState,
    fspSessionId,
    providerSessionId,
    errorMessage,
    bridgeReady,
    interactivityType,
    isPushToTalkActive,
    isListeningActive,
    streamReady,
    diagnosticRunId,
    diagnosticRun,
    micPermission,
    createFspSession,
    startLiveAvatar,
    stopSession,
    startPushToTalk,
    stopPushToTalk,
    startListening,
    stopListening,
  } = useFspLiveAvatarSession(videoRef);

  const displayError = errorMessage ?? localError;
  const isConversational = interactivityType === "CONVERSATIONAL";
  const readiness = getLiveAvatarReadiness({
    bridgeReady,
    fspSessionId,
    providerSessionId,
    uiState,
    streamReady,
    busy,
  });
  const canPushToTalk =
    !isConversational && readiness.canUseVoice;
  const canListenControl =
    isConversational && readiness.canUseVoice;

  async function runAction(action: () => Promise<void>) {
    setLocalError(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Aktion fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="liveavatar-panel" aria-labelledby="liveavatar-title">
      <div className="liveavatar-header">
        <div>
          <div className="eyebrow">FSP SLE · LiveAvatar Prototyp</div>
          <h2 id="liveavatar-title">
            Video-Avatar · {interactivityLabel(interactivityType)}
          </h2>
          <p className="muted-copy">
            Erstellt eine FSP-Sitzung, holt ein serverseitiges LiveAvatar-Token und
            startet die WebRTC-Session im Browser. Kein API-Schlüssel im Client.
          </p>
        </div>
        <Link className="button button-secondary" href="/">
          Startseite
        </Link>
      </div>

      {diagnosticRunId ? (
        <div className="notice notice-info liveavatar-debug-banner">
          <strong>Diagnose-Lauf:</strong> <code>{diagnosticRunId}</code>
          <span className="muted-copy">
            {" "}
            · Ereignisse werden an Vercel-Logs (
            <code>diagnostic_run_id={diagnosticRunId}</code>) und den Server-Cache
            gesendet. Panel unten für Klassifikation + JSON-Export.
          </span>
        </div>
      ) : null}

      {isLiveAvatarDebugEnabled() && diagnosticRunId ? (
        <LiveAvatarDebugPanel
          key={diagnosticRunId}
          runId={diagnosticRunId}
          diagnosticRun={diagnosticRun}
        />
      ) : null}

      <div className="notice notice-warning">
        Unabhängiges Training. Keine offizielle Genehmigung durch die Ärztekammer
        Nordrhein. Keine medizinische Beratung. Falldaten unverified.
      </div>

      {bridgeReady === false ? (
        <div className="notice notice-warning">
          HeyGen/LiveAvatar ist lokal nicht konfiguriert. Setzen Sie{" "}
          <code>HEYGEN_API_KEY</code>, <code>HEYGEN_LIVEAVATAR_AVATAR_ID</code>,{" "}
          <code>HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID</code> und{" "}
          <code>FSP_PUBLIC_BASE_URL</code> (oder testen Sie auf Vercel Preview).
        </div>
      ) : null}

      <div className="liveavatar-status-grid" aria-label="Verbindungsstatus">
        <div>
          <span>Bridge</span>
          <strong>{bridgeReady === null ? "…" : bridgeReady ? "bereit" : "fehlt"}</strong>
        </div>
        <div>
          <span>Modus</span>
          <strong>{interactivityLabel(interactivityType)}</strong>
        </div>
        <div>
          <span>FSP-Sitzung</span>
          <strong>{fspSessionId ? shortId(fspSessionId) : "—"}</strong>
        </div>
        <div>
          <span>LiveAvatar</span>
          <strong>{providerSessionId ? shortId(providerSessionId) : "—"}</strong>
        </div>
        <div>
          <span>Status</span>
          <span className={statusClass(readiness.statusTone)}>
            {readiness.statusLabel}
          </span>
        </div>
        <div>
          <span>Mikrofon</span>
          <strong>{micPermission}</strong>
        </div>
      </div>

      <div className={`avatar-shell liveavatar-shell ${streamReady ? "avatar-stream-ready" : ""}`}>
        <div className="avatar-status-row">
          <span className={statusClass(readiness.statusTone)}>
            {readiness.statusLabel}
          </span>
          <span className="muted-copy">
            {streamReady ? "Videostream aktiv" : "Warte auf Avatar-Video …"}
          </span>
        </div>

        <div className="liveavatar-video-wrap">
          <video
            ref={videoRef}
            className="liveavatar-video"
            autoPlay
            playsInline
            muted={false}
            aria-label="LiveAvatar Video der fiktiven Patientin"
          />
          {!streamReady ? (
            <div className="liveavatar-video-placeholder" aria-hidden="true">
              <div className="avatar-initials">FS</div>
              <span>Frau S. · fiktive Patientin</span>
            </div>
          ) : null}
        </div>

        <div className="avatar-caption">
          <strong>Frau S.</strong>
          <span>Systemischer Lupus erythematodes · FULL Mode</span>
        </div>
      </div>

      {isConversational ? (
        <div className="notice notice-info liveavatar-mode-hint">
          <strong>Konversationsmodus:</strong> Nach dem Verbinden und wenn Katya
          sichtbar ist, sprechen Sie frei auf Deutsch — kein Push-to-Talk nötig.
          Optional können Sie unten „Zuhören starten/stoppen“ nutzen, um explizit
          Listening-Befehle an HeyGen zu senden.
        </div>
      ) : (
        <div className="notice notice-info liveavatar-mode-hint">
          <strong>Push-to-Talk:</strong> Halten Sie die Taste während der gesamten
          Äußerung gedrückt und lassen Sie erst danach los.
        </div>
      )}

      {displayError ? (
        <div className="notice notice-error" role="alert">
          {displayError}
        </div>
      ) : null}

      <div className="liveavatar-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || Boolean(fspSessionId)}
          onClick={() => void runAction(async () => {
            await createFspSession();
          })}
        >
          FSP-Sitzung erstellen
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={!readiness.canStart}
          onClick={() => void runAction(startLiveAvatar)}
        >
          LiveAvatar verbinden
        </button>

        {isConversational ? (
          <>
            <button
              type="button"
              className={`button button-secondary ${isListeningActive ? "button-ptt-active" : ""}`}
              disabled={busy || !canListenControl || isListeningActive}
              onClick={() => void startListening()}
            >
              Zuhören starten
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || !canListenControl || !isListeningActive}
              onClick={() => void stopListening()}
            >
              Zuhören stoppen
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`button button-ptt ${isPushToTalkActive ? "button-ptt-active" : ""}`}
            disabled={busy || !canPushToTalk}
            onPointerDown={() => void startPushToTalk()}
            onPointerUp={() => void stopPushToTalk()}
            onPointerLeave={() => {
              if (isPushToTalkActive) {
                void stopPushToTalk();
              }
            }}
          >
            {isPushToTalkActive ? "Sprechen …" : "Push-to-Talk halten"}
          </button>
        )}

        <button
          type="button"
          className="button button-secondary"
          disabled={busy || !readiness.canStop}
          onClick={() => void runAction(stopSession)}
        >
          Session beenden
        </button>
      </div>

      <p className="muted-copy liveavatar-footnote">
        Patientenantworten über Custom LLM{" "}
        <code>/v1/chat/completions</code>. Avatar-Gesicht und Stimme über HeyGen
        LiveAvatar FULL Mode.
      </p>
    </section>
  );
}
