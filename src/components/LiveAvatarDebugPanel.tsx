"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { classifyDiagnosticRun } from "@/lib/liveavatar/diagnosticClassification";
import type { DiagnosticBreakpoint, DiagnosticRun } from "@/lib/liveavatar/diagnosticTypes";
import type { LiveAvatarDiagnosticRun } from "@/lib/liveavatar/diagnosticRun";

type LiveAvatarDebugPanelProps = {
  runId: string;
  diagnosticRun: LiveAvatarDiagnosticRun | null;
};

const BREAKPOINT_LABELS: Record<DiagnosticBreakpoint, string> = {
  TOKEN_FAIL: "Token mint / session-token failed",
  SDK_START_FAIL: "LiveAvatar SDK start failed",
  VIDEO_FAIL: "No video stream (SESSION_STREAM_READY missing)",
  MIC_FAIL: "Microphone permission denied",
  NO_OUTBOUND_AUDIO: "No outbound RTP audio after user spoke",
  NO_LLM_CALLBACK: "HeyGen did not call Custom LLM during run",
  LLM_400: "Custom LLM returned HTTP 4xx",
  LLM_200_NO_CONTENT: "Custom LLM 200 but empty assistant content",
  LLM_200_CONTENT_NO_AUDIO: "Custom LLM content but avatar did not speak",
  PLAYBACK_MUTED: "Remote video/audio muted",
  AVATAR_RESPONDED: "Avatar speak event observed",
  UNKNOWN: "Pipeline incomplete or inconclusive",
};

function mergeEvents(
  clientEvents: Array<{ ts: string; phase: string; payload?: Record<string, unknown> }>,
  serverRun: DiagnosticRun | null,
) {
  const serverEvents = (serverRun?.events ?? []).map((event) => ({
    ts: event.ts,
    phase: event.phase,
    source: event.source ?? "server",
    payload: event.payload,
  }));
  const client = clientEvents.map((event) => ({
    ts: event.ts,
    phase: event.phase,
    source: "client" as const,
    payload: event.payload,
  }));
  return [...client, ...serverEvents].sort((a, b) => a.ts.localeCompare(b.ts));
}

export function LiveAvatarDebugPanel({
  runId,
  diagnosticRun,
}: LiveAvatarDebugPanelProps) {
  const [serverRun, setServerRun] = useState<DiagnosticRun | null>(null);
  const [clientEvents, setClientEvents] = useState<
    Array<{ ts: string; phase: string; payload?: Record<string, unknown> }>
  >([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosticRun) {
      return;
    }
    return diagnosticRun.subscribe((events) => {
      setClientEvents(events);
    });
  }, [diagnosticRun]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/debug/liveavatar/runs/${runId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as DiagnosticRun;
        if (!cancelled) {
          setServerRun(payload);
        }
      } catch {
        // Server cache may miss on cold instances; client buffer still available.
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId]);

  const mergedRun = useMemo((): DiagnosticRun => {
    const events = mergeEvents(clientEvents, serverRun).map((event) => ({
      ts: event.ts,
      phase: event.phase,
      source: event.source,
      payload: event.payload,
    }));
    return {
      runId,
      startedAt: serverRun?.startedAt ?? clientEvents[0]?.ts ?? new Date().toISOString(),
      endedAt: serverRun?.endedAt,
      interactivityType: serverRun?.interactivityType,
      fspSessionIdPrefix: serverRun?.fspSessionIdPrefix,
      providerSessionIdPrefix: serverRun?.providerSessionIdPrefix,
      events,
    };
  }, [clientEvents, runId, serverRun]);

  const classification =
    serverRun?.classification ?? classifyDiagnosticRun(mergedRun);

  const exportPayload = useMemo(() => {
    return diagnosticRun?.buildExportPayload({
      ...mergedRun,
      classification,
    });
  }, [classification, diagnosticRun, mergedRun]);

  const copyJson = useCallback(async () => {
    if (!exportPayload) {
      return;
    }
    const text = JSON.stringify(exportPayload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("In Zwischenablage kopiert");
    } catch {
      setCopyStatus("Kopieren fehlgeschlagen — Download nutzen");
    }
  }, [exportPayload]);

  const downloadJson = useCallback(() => {
    if (!exportPayload) {
      return;
    }
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fsp-liveavatar-diag-${runId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCopyStatus("JSON heruntergeladen");
  }, [exportPayload, runId]);

  const timeline = mergeEvents(clientEvents, serverRun).slice(-40);

  return (
    <section className="liveavatar-debug-panel" aria-label="LiveAvatar Diagnose">
      <div className="liveavatar-debug-panel-header">
        <div>
          <strong>Diagnose</strong>
          <code className="liveavatar-debug-run-id">{runId}</code>
        </div>
        <div
          className={`liveavatar-debug-classification classification-${classification.toLowerCase()}`}
        >
          {classification}: {BREAKPOINT_LABELS[classification]}
        </div>
      </div>

      <div className="liveavatar-debug-actions">
        <button type="button" className="button button-secondary" onClick={() => void copyJson()}>
          JSON kopieren
        </button>
        <button type="button" className="button button-secondary" onClick={downloadJson}>
          JSON herunterladen
        </button>
        {copyStatus ? <span className="muted-copy">{copyStatus}</span> : null}
      </div>

      <p className="muted-copy liveavatar-debug-note">
        Dauerhafte Spur: Vercel-Logs mit Filter{" "}
        <code>diagnostic_run_id={runId}</code>. Dieses Panel merged Client-Puffer +
        Server-Cache (warm instance).
      </p>

      <ol className="liveavatar-debug-timeline">
        {timeline.map((event, index) => (
          <li key={`${event.ts}-${event.phase}-${index}`}>
            <time dateTime={event.ts}>{event.ts.slice(11, 23)}</time>
            <span className="liveavatar-debug-phase">{event.phase}</span>
            <span className="muted-copy">{event.source ?? "client"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
