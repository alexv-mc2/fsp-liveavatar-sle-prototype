"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
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
  installPeerConnectionTap,
  isLiveAvatarDebugEnabled,
  LiveAvatarDiagnosticRun,
} from "@/lib/liveavatar/diagnosticRun";
import {
  startSdkPushToTalk,
  stopSdkPushToTalk,
} from "@/lib/liveavatar/pushToTalk";
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
  const [micPermission, setMicPermission] = useState<
    "unknown" | "granted" | "denied" | "prompt"
  >("unknown");

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
      setDiagnosticRunId(run.runId);
    });
  }, [diagnosticRunId, interactivityType]);

  const createFspSession = useCallback(async () => {
    setErrorMessage(null);
    await diagnosticRef.current?.log("connect_start", {
      interactivity_type: interactivityType,
    });

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("FSP-Sitzung konnte nicht erstellt werden.");
    }

    const payload = (await response.json()) as { session?: { id?: string } };
    const id = payload.session?.id;
    if (typeof id !== "string") {
      throw new Error("Ungültige FSP-Sitzungsantwort.");
    }

    setFspSessionId(id);
    await diagnosticRef.current?.log("fsp_session_created", {
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
      setErrorMessage("Bitte zuerst eine FSP-Sitzung erstellen.");
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

      const tokenPayload = await requestHeyGenSessionToken(fspSessionId);
      const mintedMode =
        tokenPayload.interactivity_type ?? interactivityType;
      setInteractivityType(mintedMode);
      setProviderSessionId(tokenPayload.provider_session_id);

      await diagnosticRef.current?.log("token_received", {
        interactivity_type: mintedMode,
        provider_session_id_prefix: tokenPayload.provider_session_id.slice(0, 8),
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

      session.voiceChat.on(VoiceChatEvent.MUTED, () => {
        void diagnosticRef.current?.log("voice_chat_muted");
      });
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        void diagnosticRef.current?.log("voice_chat_unmuted");
      });
      session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (state) => {
        void diagnosticRef.current?.log("voice_chat_state", { state: String(state) });
      });

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        void diagnosticRef.current?.log("sdk_session_state", { state: String(state) });
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
        void diagnosticRef.current?.snapshotSession(
          session,
          "stream_ready",
          videoRef.current,
        );
        startRtpSampling(session);
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
        void diagnosticRef.current?.log("sdk_disconnected", {
          reason: String(reason),
        });
        if (reason === SessionDisconnectReason.SESSION_START_FAILED) {
          setErrorMessage("LiveAvatar-Verbindung konnte nicht gestartet werden.");
          setUiState("error");
        }
      });

      await session.start();
      await diagnosticRef.current?.log("sdk_started", {
        interactivity_type: mintedMode,
      });
      await diagnosticRef.current?.snapshotSession(
        session,
        "sdk_started_snapshot",
        videoRef.current,
      );
    } catch (error) {
      sessionRef.current = null;
      setUiState("error");
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler beim Start.";
      setErrorMessage(message);
      await diagnosticRef.current?.log("sdk_error", { message });
    }
  }, [
    bridgeReady,
    fspSessionId,
    interactivityType,
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
      await diagnosticRef.current?.snapshotSession(
        session,
        "ptt_start",
        videoRef.current,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Mikrofon / Push-to-Talk fehlgeschlagen.",
      );
      await diagnosticRef.current?.log("ptt_start_error", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }, [interactivityType, uiState, videoRef]);

  const stopPushToTalk = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || interactivityType !== "PUSH_TO_TALK") {
      return;
    }

    try {
      await stopSdkPushToTalk(session.voiceChat);
      await diagnosticRef.current?.snapshotSession(
        session,
        "ptt_stop",
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
        "conversational_listening_start_snapshot",
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
        "conversational_listening_stop_snapshot",
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
