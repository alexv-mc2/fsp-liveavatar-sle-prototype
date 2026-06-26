import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import type { DiagnosticInteractivityMode } from "./diagnosticTypes";
import { FSP_DIAGNOSTIC_RUN_HEADER } from "./diagnosticTypes";

const DIAGNOSTIC_RUNS_PATH = "/api/debug/liveavatar/runs";

function generateRunId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function isLiveAvatarDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("fsp_debug");
}

export function diagnosticRequestHeaders(
  runId: string | null | undefined,
): Record<string, string> {
  if (!runId) {
    return {};
  }
  return { [FSP_DIAGNOSTIC_RUN_HEADER]: runId };
}

export type ClientDiagnosticEvent = {
  ts: string;
  phase: string;
  payload?: Record<string, unknown>;
};

export class LiveAvatarDiagnosticRun {
  readonly runId: string;
  private ended = false;
  private readonly localEvents: ClientDiagnosticEvent[] = [];
  private eventListeners = new Set<(events: ClientDiagnosticEvent[]) => void>();

  private constructor(runId: string) {
    this.runId = runId;
  }

  getEvents(): ClientDiagnosticEvent[] {
    return [...this.localEvents];
  }

  subscribe(listener: (events: ClientDiagnosticEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    listener(this.getEvents());
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  static async start(
    interactivityType?: DiagnosticInteractivityMode,
  ): Promise<LiveAvatarDiagnosticRun | null> {
    if (!isLiveAvatarDebugEnabled()) {
      return null;
    }

    const runId = generateRunId();
    const run = new LiveAvatarDiagnosticRun(runId);

    await run.recordLocal("page_load", {
      path: window.location.pathname,
      search: window.location.search ? "fsp_debug=1" : "",
    });

    try {
      const response = await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...diagnosticRequestHeaders(runId),
        },
        body: JSON.stringify({
          run_id: runId,
          interactivity_type: interactivityType,
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        await run.recordLocal("run_create_failure", { http_status: response.status });
        console.warn("[fsp-diag] run start failed", response.status);
        return run;
      }
      await run.recordLocal("run_created", { interactivity_type: interactivityType });
      console.info("[fsp-diag] diagnostic_run_id", runId);
      return run;
    } catch (error) {
      await run.recordLocal("run_create_failure", {
        message: error instanceof Error ? error.message : "unknown",
      });
      console.warn("[fsp-diag] run start error", error);
      return run;
    }
  }

  private notify(): void {
    const snapshot = this.getEvents();
    for (const listener of this.eventListeners) {
      listener(snapshot);
    }
  }

  private async recordLocal(
    phase: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const event: ClientDiagnosticEvent = {
      ts: new Date().toISOString(),
      phase,
      payload,
    };
    this.localEvents.push(event);
    this.notify();
    console.info("[fsp-diag]", phase, payload ?? {});
  }

  async log(phase: string, payload?: Record<string, unknown>): Promise<void> {
    await this.recordLocal(phase, payload);
    if (this.ended) {
      return;
    }

    try {
      await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...diagnosticRequestHeaders(this.runId),
        },
        body: JSON.stringify({
          run_id: this.runId,
          phase,
          payload,
          source: "client",
        }),
        cache: "no-store",
      });
    } catch {
      // Best-effort diagnostic transport; local buffer remains source for export.
    }
  }

  async snapshotSession(
    session: LiveAvatarSession,
    phase: string,
    video?: HTMLVideoElement | null,
  ): Promise<void> {
    const { snapshotVoiceChat, snapshotLocalAudioTrack, readOutboundAudioRtp } =
      await import("./pttDiagnostics");

    const voice = snapshotVoiceChat(session.voiceChat);
    const track = snapshotLocalAudioTrack(session);
    const rtp = await readOutboundAudioRtp(session);
    const remote = video
      ? {
          readyState: video.readyState,
          paused: video.paused,
          muted: video.muted,
          width: video.videoWidth,
          height: video.videoHeight,
        }
      : null;

    if (phase.includes("rtp")) {
      await this.log("outbound_rtp_snapshot", { voice, track, rtp, remote });
    } else if (phase.includes("audio")) {
      await this.log("audio_track_snapshot", { voice, track, rtp, remote });
    } else {
      await this.log("remote_audio_snapshot", { voice, track, rtp, remote });
    }
  }

  async end(): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    await this.log("stop_cleanup");
    try {
      await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...diagnosticRequestHeaders(this.runId),
        },
        body: JSON.stringify({ action: "end", run_id: this.runId }),
        cache: "no-store",
      });
    } catch {
      // Best-effort.
    }
  }

  buildExportPayload(serverRun?: Record<string, unknown> | null): Record<string, unknown> {
    const serverEvents = Array.isArray(serverRun?.events)
      ? (serverRun.events as Array<{ phase?: string; payload?: Record<string, unknown> }>)
      : [];
    const callbackEvent = [...serverEvents]
      .reverse()
      .find(
        (event) =>
          event.phase === "custom_llm_callback" ||
          event.phase === "custom_llm_result",
      );
    const routeProofEvent = [...serverEvents]
      .reverse()
      .find((event) => event.payload?.route_proof || event.payload?.route_match != null);

    return {
      diagnostic_run_id: this.runId,
      exported_at: new Date().toISOString(),
      client_events: this.localEvents,
      server_run: serverRun ?? null,
      route_proof:
        routeProofEvent?.payload ??
        callbackEvent?.payload ??
        null,
      custom_llm_callback:
        callbackEvent?.payload?.custom_llm_callback_received === true
          ? callbackEvent.payload
          : null,
      classification:
        (serverRun?.classification as string | undefined) ??
        null,
      persistence_note:
        "Primary durable trail: Vercel logs filtered by diagnostic_run_id. This JSON merges client buffer + best-effort server cache.",
    };
  }
}

export type { DiagnosticInteractivityMode as LiveAvatarInteractivityMode };

export { installPeerConnectionTap } from "./pttDiagnostics";
