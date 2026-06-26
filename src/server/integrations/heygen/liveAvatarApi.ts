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

export class LiveAvatarApiError extends Error {
  readonly status: number;
  readonly code: "liveavatar_api_error" | "liveavatar_timeout" | "liveavatar_invalid_response";

  constructor(
    message: string,
    status: number,
    code: LiveAvatarApiError["code"] = "liveavatar_api_error",
  ) {
    super(message);
    this.name = "LiveAvatarApiError";
    this.status = status;
    this.code = code;
  }
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
): Promise<LiveAvatarApiEnvelope<T>> {
  const payload = (await response.json().catch(() => null)) as
    | LiveAvatarApiEnvelope<T>
    | null;

  if (!response.ok) {
    throw new LiveAvatarApiError(
      "LiveAvatar session token request failed.",
      502,
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

export async function mintLiveAvatarSessionToken(
  config: LiveAvatarRuntimeConfig,
  fetchFn: typeof fetch = fetch,
  options: { fspSessionId?: string } = {},
): Promise<{ sessionId: string; sessionToken: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LIVEAVATAR_REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
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
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseLiveAvatarResponse<CreateSessionTokenData>(response);

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
  };
}
