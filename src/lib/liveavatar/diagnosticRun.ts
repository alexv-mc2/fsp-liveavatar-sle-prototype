import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import {
  readOutboundAudioRtp,
  snapshotLocalAudioTrack,
  snapshotVoiceChat,
} from "./pttDiagnostics";

export type LiveAvatarInteractivityMode = "PUSH_TO_TALK" | "CONVERSATIONAL";

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

export class LiveAvatarDiagnosticRun {
  readonly runId: string;
  private ended = false;

  private constructor(runId: string) {
    this.runId = runId;
  }

  static async start(
    interactivityType?: LiveAvatarInteractivityMode,
  ): Promise<LiveAvatarDiagnosticRun | null> {
    if (!isLiveAvatarDebugEnabled()) {
      return null;
    }

    const runId = generateRunId();
    try {
      const response = await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          run_id: runId,
          interactivity_type: interactivityType,
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        console.warn("[fsp-diag] run start failed", response.status);
        return null;
      }
      const run = new LiveAvatarDiagnosticRun(runId);
      console.info("[fsp-diag] diagnostic_run_id", runId);
      return run;
    } catch (error) {
      console.warn("[fsp-diag] run start error", error);
      return null;
    }
  }

  async log(phase: string, payload?: Record<string, unknown>): Promise<void> {
    console.info("[fsp-diag]", phase, payload ?? {});
    if (this.ended) {
      return;
    }

    try {
      await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          run_id: this.runId,
          phase,
          payload,
        }),
        cache: "no-store",
      });
    } catch {
      // Best-effort diagnostic transport.
    }
  }

  async snapshotSession(
    session: LiveAvatarSession,
    phase: string,
    video?: HTMLVideoElement | null,
  ): Promise<void> {
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

    await this.log(phase, { voice, track, rtp, remote });
  }

  async end(): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    try {
      await fetch(DIAGNOSTIC_RUNS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "end", run_id: this.runId }),
        cache: "no-store",
      });
    } catch {
      // Best-effort.
    }
  }
}

export { installPeerConnectionTap } from "./pttDiagnostics";
