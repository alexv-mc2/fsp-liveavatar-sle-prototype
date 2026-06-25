"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAvatarSession,
  SessionDisconnectReason,
  SessionEvent,
  SessionState,
} from "@heygen/liveavatar-web-sdk";
import {
  fetchHeyGenBridgeStatus,
  isBridgeReady,
  requestHeyGenSessionToken,
} from "@/lib/liveavatar/clientApi";
import { LIVEAVATAR_SDK_API_URL } from "@/lib/liveavatar/constants";
import {
  startSdkPushToTalk,
  stopSdkPushToTalk,
} from "@/lib/liveavatar/pushToTalk";
import type { LiveAvatarUiState } from "@/lib/liveavatar/types";

export function useFspLiveAvatarSession(
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const [uiState, setUiState] = useState<LiveAvatarUiState>("idle");
  const [fspSessionId, setFspSessionId] = useState<string | null>(null);
  const [providerSessionId, setProviderSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchHeyGenBridgeStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        const ready = isBridgeReady(status);
        setBridgeReady(ready);
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

  const createFspSession = useCallback(async () => {
    setErrorMessage(null);
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
    if (uiState === "unconfigured") {
      setUiState("unconfigured");
    } else {
      setUiState("idle");
    }
    return id;
  }, [uiState]);

  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setIsPushToTalkActive(false);
    setStreamReady(false);

    if (session) {
      setUiState("stopping");
      try {
        await session.stop();
      } catch {
        // Best-effort cleanup.
      }
    }

    setProviderSessionId(null);
    setUiState(bridgeReady === false ? "unconfigured" : "idle");
  }, [bridgeReady]);

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

    try {
      const tokenPayload = await requestHeyGenSessionToken(fspSessionId);
      setProviderSessionId(tokenPayload.provider_session_id);

      const session = new LiveAvatarSession(tokenPayload.session_token, {
        apiUrl: LIVEAVATAR_SDK_API_URL,
        voiceChat: true,
      });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        if (state === SessionState.CONNECTED) {
          setUiState("connected");
        } else if (state === SessionState.DISCONNECTING) {
          setUiState("stopping");
        } else if (state === SessionState.DISCONNECTED) {
          sessionRef.current = null;
          setStreamReady(false);
          setIsPushToTalkActive(false);
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
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
        if (reason === SessionDisconnectReason.SESSION_START_FAILED) {
          setErrorMessage("LiveAvatar-Verbindung konnte nicht gestartet werden.");
          setUiState("error");
        }
      });

      await session.start();
    } catch (error) {
      sessionRef.current = null;
      setUiState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Unbekannter Fehler beim Start.",
      );
    }
  }, [bridgeReady, fspSessionId, videoRef]);

  const startPushToTalk = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || uiState !== "connected") {
      return;
    }

    try {
      await startSdkPushToTalk(session.voiceChat);
      setIsPushToTalkActive(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Mikrofon / Push-to-Talk fehlgeschlagen.",
      );
    }
  }, [uiState]);

  const stopPushToTalk = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    try {
      await stopSdkPushToTalk(session.voiceChat);
    } finally {
      setIsPushToTalkActive(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
    };
  }, []);

  return {
    uiState,
    fspSessionId,
    providerSessionId,
    errorMessage,
    bridgeReady,
    isPushToTalkActive,
    streamReady,
    createFspSession,
    startLiveAvatar,
    stopSession,
    startPushToTalk,
    stopPushToTalk,
  };
}
