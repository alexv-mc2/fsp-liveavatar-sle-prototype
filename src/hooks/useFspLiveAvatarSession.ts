"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionDisconnectReason,
  SessionEvent,
  SessionInteractivityMode,
  SessionState,
  VoiceChatEvent,
} from "@heygen/liveavatar-web-sdk";
import {
  fetchHeyGenBridgeStatus,
  isBridgeReady,
  requestHeyGenSessionToken,
} from "@/lib/liveavatar/clientApi";
import { LIVEAVATAR_SDK_API_URL } from "@/lib/liveavatar/constants";
import {
  diagnosticRequestHeaders,
  installPeerConnectionTap,
  isLiveAvatarDebugEnabled,
  LiveAvatarDiagnosticRun,
} from "@/lib/liveavatar/diagnosticRun";
import { runGreetingDiagnostic } from "@/lib/liveavatar/greetingDiagnostic";
import {
  startSdkPushToTalk,
  stopSdkPushToTalk,
} from "@/lib/liveavatar/pushToTalk";
import { decodeSessionTokenClaimsSanitized } from "@/lib/liveavatar/tokenClaimsSanitized";
import type {
  LiveAvatarInteractivityMode,
  LiveAvatarUiState,
} from "@/lib/liveavatar/types";

function resolveSdkInteractivityMode(
  mode: LiveAvatarInteractivityMode,
): SessionInteractivityMode {
  return mode === "CONVERSATIONAL"
    ? SessionInteractivityMode.CONVERSATIONAL
    : SessionInteractivityMode.PUSH_TO_TALK;
}

export function useFspLiveAvatarSession(
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const diagnosticRef = useRef<LiveAvatarDiagnosticRun | null>(null);
  const rtpIntervalRef = useRef<number | null>(null);

  const [uiState, setUiState] = useState<LiveAvatarUiState>("idle");
  const [fspSessionId, setFspSessionId] = useState<string | null>(null);
  const [providerSessionId, setProviderSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const [interactivityType, setInteractivityType] =
    useState<LiveAvatarInteractivityMode>("PUSH_TO_TALK");
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [isListeningActive, setIsListeningActive] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [diagnosticRunId, setDiagnosticRunId] = useState<string | null>(null);
  const [diagnosticRun, setDiagnosticRun] = useState<LiveAvatarDiagnosticRun | null>(
    null,
  );
  const [micPermission, setMicPermission] = useState<
    "unknown" | "granted" | "denied" | "prompt"
  >("unknown");

  const logVisibleError = useCallback(async (message: string) => {
    setErrorMessage(message);
    await diagnosticRef.current?.log("visible_error", { message });
  }, []);

  const stopRtpSampling = useCallback(() => {
    if (rtpIntervalRef.current !== null) {
      window.clearInterval(rtpIntervalRef.current);
      rtpIntervalRef.current = null;
    }
  }, []);

  const startRtpSampling = useCallback(
    (session: LiveAvatarSession) => {
      if (!isLiveAvatarDebugEnabled()) {
        return;
      }
      stopRtpSampling();
      rtpIntervalRef.current = window.setInterval(() => {
        void diagnosticRef.current?.snapshotSession(
          session,
          "outbound_rtp_snapshot",
          videoRef.current,
        );
      }, 5000);
    },
    [stopRtpSampling, videoRef],
  );

  const attachAgentEventLogging = useCallback((session: LiveAvatarSession) => {
    if (!isLiveAvatarDebugEnabled()) {
      return;
    }

    const agentEvents = [
      AgentEventsEnum.AVATAR_SPEAK_STARTED,
      AgentEventsEnum.AVATAR_SPEAK_ENDED,
      AgentEventsEnum.USER_SPEAK_STARTED,
      AgentEventsEnum.USER_SPEAK_ENDED,
      AgentEventsEnum.AVATAR_TRANSCRIPTION,
      AgentEventsEnum.USER_TRANSCRIPTION,
    ] as const;

    for (const eventName of agentEvents) {
      session.on(eventName, (event: { event_type?: string }) => {
        void diagnosticRef.current?.log("sdk_event", {
          agent_event: eventName,
          name: eventName,
          event_type: event?.event_type,
        });
        if (eventName === AgentEventsEnum.AVATAR_SPEAK_STARTED) {
          void diagnosticRef.current?.log("avatar_speak_started");
        }
        if (eventName === AgentEventsEnum.AVATAR_SPEAK_ENDED) {
          void diagnosticRef.current?.log("avatar_speak_ended");
        }
      });
    }
  }, []);

  useEffect(() => {
    if (isLiveAvatarDebugEnabled()) {
      installPeerConnectionTap();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchHeyGenBridgeStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        const ready = isBridgeReady(status);
        setBridgeReady(ready);
        setInteractivityType(
          status.interactivity_type ??
            status.env.runtimeResolved?.INTERACTIVITY_TYPE ??
            status.env.runtimeDefaults.INTERACTIVITY_TYPE ??
            "PUSH_TO_TALK",
        );
        if (!ready) {
          setUiState("unconfigured");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBridgeReady(false);
          setUiState("unconfigured");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLiveAvatarDebugEnabled() || diagnosticRunId) {
      return;
    }

    void LiveAvatarDiagnosticRun.start(interactivityType).then((run) => {
      if (!run) {
        return;
      }
      diagnosticRef.current = run;
      setDiagnosticRun(run);
      setDiagnosticRunId(run.runId);
    });
  }, [diagnosticRunId, interactivityType]);

  const createFspSession = useCallback(async () => {
    setErrorMessage(null);
    await diagnosticRef.current?.log("fsp_session_create_start", {
      interactivity_type: interactivityType,
    });

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...diagnosticRequestHeaders(diagnosticRef.current?.runId),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      await diagnosticRef.current?.log("fsp_session_create_failure", {
        http_status: response.status,
      });
      throw new Error("FSP-Sitzung konnte nicht erstellt werden.");
    }

    const payload = (await response.json()) as { session?: { id?: string } };
    const id = payload.session?.id;
    if (typeof id !== "string") {
      await diagnosticRef.current?.log("fsp_session_create_failure", {
        reason: "invalid_response",
      });
      throw new Error("Ungültige FSP-Sitzungsantwort.");
    }

    setFspSessionId(id);
    await diagnosticRef.current?.log("fsp_session_create_success", {
      session_id_prefix: id.slice(0, 8),
    });
    if (uiState === "unconfigured") {
      setUiState("unconfigured");
    } else {
      setUiState("idle");
    }
    return id;
  }, [interactivityType, uiState]);

  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setIsPushToTalkActive(false);
    setIsListeningActive(false);
    setStreamReady(false);
    stopRtpSampling();

    if (session) {
      setUiState("stopping");
      await diagnosticRef.current?.log("stop_cleanup");
      try {
        await session.stop();
      } catch {
        // Best-effort cleanup.
      }
    }

    setProviderSessionId(null);
    setUiState(bridgeReady === false ? "unconfigured" : "idle");
    await diagnosticRef.current?.end();
  }, [bridgeReady, stopRtpSampling]);

  const startLiveAvatar = useCallback(async () => {
    if (!fspSessionId) {
      await logVisibleError("Bitte zuerst eine FSP-Sitzung erstellen.");
      return;
    }

    if (sessionRef.current) {
      return;
    }

    setUiState("starting");
    setErrorMessage(null);
    setStreamReady(false);

    if (isLiveAvatarDebugEnabled()) {
      installPeerConnectionTap();
    }

    let tokenMinted = false;

    try {
      if (navigator.permissions?.query) {
        try {
          const mic = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          setMicPermission(mic.state);
          await diagnosticRef.current?.log("mic_permission", { state: mic.state });
        } catch {
          setMicPermission("unknown");
        }
      }

      await diagnosticRef.current?.log("session_token_start", {
        fsp_session_id_prefix: fspSessionId.slice(0, 8),
      });

      const tokenPayload = await requestHeyGenSessionToken(fspSessionId, fetch, {
        diagnosticRunId: diagnosticRef.current?.runId,
      });
      tokenMinted = true;
      const mintedMode =
        tokenPayload.interactivity_type ?? interactivityType;
      setInteractivityType(mintedMode);
      setProviderSessionId(tokenPayload.provider_session_id);

      const tokenClaims = decodeSessionTokenClaimsSanitized(
        tokenPayload.session_token,
      );
      await diagnosticRef.current?.log("session_token_success", {
        interactivity_type: mintedMode,
        provider_session_id_prefix: tokenPayload.provider_session_id.slice(0, 8),
      });
      await diagnosticRef.current?.log("token_claims_sanitized", tokenClaims ?? {
        decode_error: true,
      });

      const sdkMode = resolveSdkInteractivityMode(mintedMode);
      const session = new LiveAvatarSession(tokenPayload.session_token, {
        apiUrl: LIVEAVATAR_SDK_API_URL,
        voiceChat: {
          mode: sdkMode,
          defaultMuted: mintedMode === "PUSH_TO_TALK",
        },
      });
      sessionRef.current = session;
      attachAgentEventLogging(session);

      session.voiceChat.on(VoiceChatEvent.MUTED, () => {
        void diagnosticRef.current?.log("voice_chat_muted");
      });
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        void diagnosticRef.current?.log("voice_chat_unmuted");
      });
      session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (state) => {
        void diagnosticRef.current?.log("sdk_event", {
          name: "VOICE_CHAT_STATE_CHANGED",
          state: String(state),
        });
      });

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        void diagnosticRef.current?.log("sdk_event", {
          name: "SESSION_STATE_CHANGED",
          state: String(state),
        });
        if (state === SessionState.CONNECTED) {
          setUiState("connected");
        } else if (state === SessionState.DISCONNECTING) {
          setUiState("stopping");
        } else if (state === SessionState.DISCONNECTED) {
          sessionRef.current = null;
          setStreamReady(false);
          setIsPushToTalkActive(false);
          setIsListeningActive(false);
          stopRtpSampling();
          setUiState(bridgeReady === false ? "unconfigured" : "idle");
        } else if (state === SessionState.CONNECTING) {
          setUiState("starting");
        }
      });

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        setStreamReady(true);
        const video = videoRef.current;
        if (video) {
          session.attach(video);
        }
        void diagnosticRef.current?.log("sdk_event", {
          name: "SESSION_STREAM_READY",
        });
        void diagnosticRef.current?.log("stream_ready");
        void diagnosticRef.current?.snapshotSession(
          session,
          "remote_audio_snapshot",
          videoRef.current,
        );
        startRtpSampling(session);
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
        void diagnosticRef.current?.log("sdk_disconnected", {
          reason: String(reason),
        });
        void diagnosticRef.current?.log("sdk_event", {
          name: "SESSION_DISCONNECTED",
          reason: String(reason),
        });
        if (reason === SessionDisconnectReason.SESSION_START_FAILED) {
          void logVisibleError(
            "LiveAvatar-Verbindung konnte nicht gestartet werden.",
          );
          setUiState("error");
        }
      });

      await diagnosticRef.current?.log("sdk_start_start", {
        interactivity_type: mintedMode,
      });
      await session.start();
      await diagnosticRef.current?.log("sdk_start_success", {
        interactivity_type: mintedMode,
      });
      await diagnosticRef.current?.snapshotSession(
        session,
        "audio_track_snapshot",
        videoRef.current,
      );

      const greeting = runGreetingDiagnostic(session);
      if (greeting.supported) {
        await diagnosticRef.current?.log("greeting_command_sent", greeting);
      } else {
        await diagnosticRef.current?.log(greeting.phase, greeting);
      }
    } catch (error) {
      sessionRef.current = null;
      setUiState("error");
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler beim Start.";
      await diagnosticRef.current?.log("sdk_start_failure", { message });
      if (!tokenMinted) {
        await diagnosticRef.current?.log("session_token_failure", { message });
      }
      await logVisibleError(message);
    }
  }, [
    attachAgentEventLogging,
    bridgeReady,
    fspSessionId,
    interactivityType,
    logVisibleError,
    startRtpSampling,
    stopRtpSampling,
    videoRef,
  ]);

  const startPushToTalk = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || uiState !== "connected" || interactivityType !== "PUSH_TO_TALK") {
      return;
    }

    try {
      await startSdkPushToTalk(session.voiceChat);
      setIsPushToTalkActive(true);
      await diagnosticRef.current?.log("ptt_start");
      await diagnosticRef.current?.snapshotSession(
        session,
        "outbound_rtp_snapshot",
        videoRef.current,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Mikrofon / Push-to-Talk fehlgeschlagen.";
      await logVisibleError(message);
      await diagnosticRef.current?.log("ptt_start_error", { message });
    }
  }, [interactivityType, logVisibleError, uiState, videoRef]);

  const stopPushToTalk = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || interactivityType !== "PUSH_TO_TALK") {
      return;
    }

    try {
      await stopSdkPushToTalk(session.voiceChat);
      await diagnosticRef.current?.log("ptt_stop");
      await diagnosticRef.current?.snapshotSession(
        session,
        "outbound_rtp_snapshot",
        videoRef.current,
      );
    } finally {
      setIsPushToTalkActive(false);
    }
  }, [interactivityType, videoRef]);

  const startListening = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || uiState !== "connected" || interactivityType !== "CONVERSATIONAL") {
      return;
    }

    try {
      session.startListening();
      setIsListeningActive(true);
      await diagnosticRef.current?.log("conversational_listening_start");
      await diagnosticRef.current?.snapshotSession(
        session,
        "audio_track_snapshot",
        videoRef.current,
      );
    } catch (error) {
      await diagnosticRef.current?.log("conversational_listening_start_error", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }, [interactivityType, uiState, videoRef]);

  const stopListening = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || interactivityType !== "CONVERSATIONAL") {
      return;
    }

    try {
      session.stopListening();
      await diagnosticRef.current?.log("conversational_listening_stop");
      await diagnosticRef.current?.snapshotSession(
        session,
        "audio_track_snapshot",
        videoRef.current,
      );
    } finally {
      setIsListeningActive(false);
    }
  }, [interactivityType, videoRef]);

  useEffect(() => {
    return () => {
      stopRtpSampling();
      void sessionRef.current?.stop();
      void diagnosticRef.current?.end();
    };
  }, [stopRtpSampling]);

  return {
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
  };
}
