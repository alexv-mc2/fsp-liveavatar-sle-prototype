import type { LiveAvatarRuntimeConfig } from "./env";

export const LIVEAVATAR_API_DEFAULT_BASE_URL = "https://api.liveavatar.com";
export const LIVEAVATAR_SESSION_TOKEN_PATH = "/v1/sessions/token";
export const LIVEAVATAR_REQUEST_TIMEOUT_MS = 10_000;

export type LiveAvatarApiEnvelope<T> = {
  code?: number;
  data?: T | null;
  message?: string | null;
};

export type CreateSessionTokenData = {
  session_id: string;
  session_token: string;
};

export type LiveAvatarTokenRequestDiagnostics = {
  phase: "liveavatar_token_request" | "liveavatar_token_response";
  payload: Record<string, unknown>;
};

export class LiveAvatarApiError extends Error {
  readonly status: number;
  readonly code: "liveavatar_api_error" | "liveavatar_timeout" | "liveavatar_invalid_response";
  readonly providerStatus?: number;
  readonly providerCode?: number | string | null;
  readonly providerMessagePrefix?: string | null;
  readonly requestMaxSessionSeconds?: number;

  constructor(
    message: string,
    status: number,
    code: LiveAvatarApiError["code"] = "liveavatar_api_error",
    metadata: {
      providerStatus?: number;
      providerCode?: number | string | null;
      providerMessagePrefix?: string | null;
      requestMaxSessionSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = "LiveAvatarApiError";
    this.status = status;
    this.code = code;
    this.providerStatus = metadata.providerStatus;
    this.providerCode = metadata.providerCode;
    this.providerMessagePrefix = metadata.providerMessagePrefix;
    this.requestMaxSessionSeconds = metadata.requestMaxSessionSeconds;
  }
}

function safeProviderMessagePrefix(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
}

function readProviderMessage(payload: LiveAvatarApiEnvelope<unknown> | null): string | null {
  const nestedError =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
      ? (payload.error as { message?: unknown })
      : null;

  return safeProviderMessagePrefix(payload?.message ?? nestedError?.message);
}

function readProviderCode(payload: LiveAvatarApiEnvelope<unknown> | null): number | string | null {
  const nestedError =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
      ? (payload.error as { code?: unknown })
      : null;
  const code = payload?.code ?? nestedError?.code;
  return typeof code === "number" || typeof code === "string" ? code : null;
}

export function buildLiveAvatarApiUrl(
  baseUrl: string,
  pathname: string,
): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname}`;
}

export function buildCreateSessionTokenBody(
  config: LiveAvatarRuntimeConfig,
  options: { fspSessionId?: string } = {},
): Record<string, unknown> {
  const avatarPersona: Record<string, string> = {
    language: config.language,
  };

  if (config.contextId) {
    avatarPersona.context_id = config.contextId;
  }

  if (config.voiceId) {
    avatarPersona.voice_id = config.voiceId;
  }

  const body: Record<string, unknown> = {
    mode: "FULL",
    avatar_id: config.avatarId,
    is_sandbox: config.sandbox,
    max_session_duration: config.maxSessionSeconds,
    interactivity_type: config.interactivityType,
    llm_configuration_id: config.llmConfigurationId,
    avatar_persona: avatarPersona,
  };

  if (options.fspSessionId) {
    body.dynamic_variables = {
      fsp_session_id: options.fspSessionId,
      case_id: "fsp-nrw-sle",
    };
  }

  return body;
}

async function parseLiveAvatarResponse<T>(
  response: Response,
  diagnostics: {
    maxSessionSeconds: number;
    onDiagnostics?: (event: LiveAvatarTokenRequestDiagnostics) => void;
  },
): Promise<LiveAvatarApiEnvelope<T>> {
  const payload = (await response.json().catch(() => null)) as
    | LiveAvatarApiEnvelope<T>
    | null;
  const providerCode = readProviderCode(payload as LiveAvatarApiEnvelope<unknown> | null);
  const providerMessagePrefix = readProviderMessage(
    payload as LiveAvatarApiEnvelope<unknown> | null,
  );

  diagnostics.onDiagnostics?.({
    phase: "liveavatar_token_response",
    payload: {
      ok: response.ok,
      http_status: response.status,
      provider_code: providerCode,
      provider_message_prefix: providerMessagePrefix,
      max_session_seconds: diagnostics.maxSessionSeconds,
    },
  });

  if (!response.ok) {
    throw new LiveAvatarApiError(
      "LiveAvatar session token request failed.",
      502,
      "liveavatar_api_error",
      {
        providerStatus: response.status,
        providerCode,
        providerMessagePrefix,
        requestMaxSessionSeconds: diagnostics.maxSessionSeconds,
      },
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new LiveAvatarApiError(
      "LiveAvatar API returned an empty response.",
      502,
      "liveavatar_invalid_response",
    );
  }

  return payload;
}

export async function fetchLiveAvatarLlmConfigurationBaseUrl(
  config: Pick<LiveAvatarRuntimeConfig, "apiKey" | "apiBaseUrl" | "llmConfigurationId">,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LIVEAVATAR_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetchFn(
      buildLiveAvatarApiUrl(
        config.apiBaseUrl,
        `/v1/llm-configurations/${config.llmConfigurationId}`,
      ),
      {
        method: "GET",
        headers: {
          "X-API-KEY": config.apiKey,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | LiveAvatarApiEnvelope<{ base_url?: string | null }>
      | null;
    const baseUrl = payload?.data?.base_url;
    return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function mintLiveAvatarSessionToken(
  config: LiveAvatarRuntimeConfig,
  fetchFn: typeof fetch = fetch,
  options: {
    fspSessionId?: string;
    onDiagnostics?: (event: LiveAvatarTokenRequestDiagnostics) => void;
  } = {},
): Promise<{ sessionId: string; sessionToken: string; maxSessionSeconds: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LIVEAVATAR_REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    options.onDiagnostics?.({
      phase: "liveavatar_token_request",
      payload: {
        mode: "FULL",
        has_avatar_id: Boolean(config.avatarId),
        has_context_id: Boolean(config.contextId),
        has_voice_id: Boolean(config.voiceId),
        has_llm_configuration_id: Boolean(config.llmConfigurationId),
        interactivity_type: config.interactivityType,
        max_session_seconds: config.maxSessionSeconds,
        sandbox: config.sandbox,
        language: config.language,
        api_base_host: new URL(config.apiBaseUrl).host,
      },
    });
    response = await fetchFn(
      buildLiveAvatarApiUrl(config.apiBaseUrl, LIVEAVATAR_SESSION_TOKEN_PATH),
      {
        method: "POST",
        headers: {
          "X-API-KEY": config.apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildCreateSessionTokenBody(config, {
            fspSessionId: options.fspSessionId,
          }),
        ),
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LiveAvatarApiError(
        "LiveAvatar API request timed out.",
        504,
        "liveavatar_timeout",
        { requestMaxSessionSeconds: config.maxSessionSeconds },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseLiveAvatarResponse<CreateSessionTokenData>(response, {
    maxSessionSeconds: config.maxSessionSeconds,
    onDiagnostics: options.onDiagnostics,
  });

  if (!payload.data?.session_id || !payload.data.session_token) {
    throw new LiveAvatarApiError(
      "LiveAvatar session token response was missing session credentials.",
      502,
      "liveavatar_invalid_response",
    );
  }

  return {
    sessionId: payload.data.session_id,
    sessionToken: payload.data.session_token,
    maxSessionSeconds: config.maxSessionSeconds,
  };
}
