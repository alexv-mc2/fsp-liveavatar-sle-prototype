import {
  FSP_HEYGEN_SESSION_TOKEN_PATH,
  FSP_HEYGEN_STATUS_PATH,
} from "./constants";
import type {
  HeyGenBridgeStatus,
  HeyGenSessionTokenError,
  HeyGenSessionTokenNotConfigured,
  HeyGenSessionTokenOk,
  LiveAvatarUiState,
} from "./types";

export type FetchFn = typeof fetch;

export function isBridgeReady(status: HeyGenBridgeStatus): boolean {
  return status.session_token_configured && status.connected;
}

export type LiveAvatarReadinessInput = {
  bridgeReady: boolean | null;
  fspSessionId: string | null;
  providerSessionId?: string | null;
  uiState: LiveAvatarUiState;
  streamReady?: boolean;
  busy: boolean;
};

export type LiveAvatarReadiness = {
  canStart: boolean;
  canStop: boolean;
  canUseVoice: boolean;
  statusLabel: string;
  statusTone: "default" | "pending" | "live" | "error" | "mock";
};

export function getLiveAvatarReadiness(
  input: LiveAvatarReadinessInput,
): LiveAvatarReadiness {
  const streamReady = input.streamReady === true;
  const hasFspSession = Boolean(input.fspSessionId);
  const hasProviderSession = Boolean(input.providerSessionId);
  const canStart =
    input.bridgeReady === true &&
    hasFspSession &&
    input.uiState === "idle" &&
    !input.busy;
  const canStop =
    input.uiState === "connected" ||
    input.uiState === "starting" ||
    input.uiState === "error";
  const canUseVoice =
    input.uiState === "connected" && hasProviderSession && streamReady && !input.busy;

  if (input.bridgeReady === false || input.uiState === "unconfigured") {
    return {
      canStart: false,
      canStop,
      canUseVoice: false,
      statusLabel: "Bridge nicht konfiguriert",
      statusTone: "mock",
    };
  }
  if (input.uiState === "error") {
    return {
      canStart: false,
      canStop,
      canUseVoice: false,
      statusLabel: "Fehler",
      statusTone: "error",
    };
  }
  if (input.uiState === "starting") {
    return {
      canStart: false,
      canStop,
      canUseVoice: false,
      statusLabel: hasProviderSession
        ? "LiveAvatar startet"
        : "Token wird vorbereitet",
      statusTone: "pending",
    };
  }
  if (input.uiState === "stopping") {
    return {
      canStart: false,
      canStop,
      canUseVoice: false,
      statusLabel: "Beende",
      statusTone: "pending",
    };
  }
  if (input.uiState === "connected") {
    return {
      canStart: false,
      canStop,
      canUseVoice,
      statusLabel: streamReady ? "Avatar bereit" : "Verbunden, warte auf Video",
      statusTone: streamReady ? "live" : "pending",
    };
  }

  return {
    canStart,
    canStop,
    canUseVoice: false,
    statusLabel: hasFspSession ? "Sitzung bereit" : "Sitzung fehlt",
    statusTone: "default",
  };
}

export function parseSessionTokenResponse(
  status: number,
  payload: unknown,
):
  | { ok: true; data: HeyGenSessionTokenOk }
  | { ok: false; kind: "not_configured"; data: HeyGenSessionTokenNotConfigured }
  | { ok: false; kind: "error"; message: string; status: number } {
  if (status === 503 && payload && typeof payload === "object") {
    const body = payload as HeyGenSessionTokenNotConfigured;
    if (body.status === "not_configured") {
      return { ok: false, kind: "not_configured", data: body };
    }
  }

  if (status === 404) {
    return {
      ok: false,
      kind: "error",
      status,
      message: "FSP-Sitzung nicht gefunden.",
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      kind: "error",
      status,
      message: "Ungültige Antwort vom Session-Token-Endpunkt.",
    };
  }

  if ("error" in payload) {
    const err = payload as HeyGenSessionTokenError;
    const debugReason = err.error?.debug?.reason;
    return {
      ok: false,
      kind: "error",
      status,
      message: debugReason
        ? `${err.error?.message ?? "LiveAvatar Session-Token fehlgeschlagen."} Debug: ${debugReason}`
        : (err.error?.message ?? "LiveAvatar Session-Token fehlgeschlagen."),
    };
  }

  const body = payload as Partial<HeyGenSessionTokenOk>;
  if (
    status === 200 &&
    body.status === "ok" &&
    typeof body.session_token === "string" &&
    typeof body.provider_session_id === "string"
  ) {
    return {
      ok: true,
      data: {
        ...(body as HeyGenSessionTokenOk),
        interactivity_type: body.interactivity_type,
      },
    };
  }

  return {
    ok: false,
    kind: "error",
    status,
    message: "LiveAvatar Session-Token fehlgeschlagen.",
  };
}

export async function fetchHeyGenBridgeStatus(
  fetchFn: FetchFn = fetch,
): Promise<HeyGenBridgeStatus> {
  const response = await fetchFn(FSP_HEYGEN_STATUS_PATH, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("HeyGen-Status konnte nicht geladen werden.");
  }

  return (await response.json()) as HeyGenBridgeStatus;
}

export async function requestHeyGenSessionToken(
  fspSessionId: string,
  fetchFn: FetchFn = fetch,
  init?: Pick<RequestInit, "signal"> & { diagnosticRunId?: string | null },
): Promise<HeyGenSessionTokenOk> {
  const response = await fetchFn(FSP_HEYGEN_SESSION_TOKEN_PATH, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.diagnosticRunId
        ? { "x-fsp-diagnostic-run-id": init.diagnosticRunId }
        : {}),
    },
    body: JSON.stringify({ fsp_session_id: fspSessionId }),
    cache: "no-store",
    signal: init?.signal,
  });

  const payload = await response.json().catch(() => null);
  const parsed = parseSessionTokenResponse(response.status, payload);

  if (parsed.ok) {
    return parsed.data;
  }

  if (parsed.kind === "not_configured") {
    throw new Error(
      parsed.data.message ??
        `LiveAvatar nicht konfiguriert (${parsed.data.missing_env.join(", ")})`,
    );
  }

  throw new Error(parsed.message);
}
