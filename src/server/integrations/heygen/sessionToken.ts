import { z } from "zod";
import { sessionStore } from "../../fsp/scenarioState";
import {
  buildCustomLlmUrl,
  readHeyGenEnvSnapshot,
  readLiveAvatarRuntimeConfig,
  type HeyGenEnvSnapshot,
} from "./env";
import { LiveAvatarApiError, mintLiveAvatarSessionToken } from "./liveAvatarApi";

export const CreateHeyGenSessionTokenRequestSchema = z.object({
  fsp_session_id: z.string().uuid(),
});

export type CreateHeyGenSessionTokenRequest = z.infer<
  typeof CreateHeyGenSessionTokenRequestSchema
>;

export interface HeyGenSessionTokenNotConfiguredResponse {
  status: "not_configured";
  mode: "FULL";
  fsp_session_id: string;
  custom_llm_url: string | null;
  correlation: {
    header: "x-fsp-session-id";
    body_fields: ["session_id", "metadata.session_id"];
  };
  message: string;
  missing_env: string[];
}

export interface HeyGenSessionTokenSuccessResponse {
  status: "ok";
  mode: "FULL";
  fsp_session_id: string;
  provider_session_id: string;
  session_token: string;
  custom_llm_url: string | null;
  correlation: {
    header: "x-fsp-session-id";
    body_fields: ["session_id", "metadata.session_id"];
  };
}

export function getHeyGenIntegrationStatus(): {
  connected: boolean;
  configured: boolean;
  session_token_configured: boolean;
  mode: "FULL";
  custom_llm_path: "/v1/chat/completions";
  custom_llm_compat_path: "/chat/completions";
  streaming: "not_implemented";
  push_to_talk: "client_not_implemented";
  env: HeyGenEnvSnapshot;
  bridge: {
    deployment_target: "vercel";
    custom_llm_url: string | null;
    session_persistence: "in_memory_deferred_supabase";
    liveavatar_runtime: "session_token_api";
    heygen_context_policy: "context_id_optional_backend_owns_fsp_context";
    documentation: "docs/LIVEAVATAR_SESSION_TOKEN.md";
  };
} {
  const env = readHeyGenEnvSnapshot();
  return {
    connected: env.sessionTokenConfigured,
    configured: env.configured,
    session_token_configured: env.sessionTokenConfigured,
    mode: "FULL",
    custom_llm_path: "/v1/chat/completions",
    custom_llm_compat_path: "/chat/completions",
    streaming: "not_implemented",
    push_to_talk: "client_not_implemented",
    env,
    bridge: {
      deployment_target: "vercel",
      custom_llm_url: env.customLlmUrl,
      session_persistence: "in_memory_deferred_supabase",
      liveavatar_runtime: "session_token_api",
      heygen_context_policy:
        "context_id_optional_backend_owns_fsp_context",
      documentation: "docs/LIVEAVATAR_SESSION_TOKEN.md",
    },
  };
}

export function createHeyGenSessionTokenNotConfigured(
  input: unknown,
): HeyGenSessionTokenNotConfiguredResponse {
  const parsed = CreateHeyGenSessionTokenRequestSchema.parse(input);
  sessionStore.require(parsed.fsp_session_id);

  const env = readHeyGenEnvSnapshot();
  const customLlmUrl = env.publicBaseUrl
    ? buildCustomLlmUrl(env.publicBaseUrl)
    : null;

  return {
    status: "not_configured",
    mode: "FULL",
    fsp_session_id: parsed.fsp_session_id,
    custom_llm_url: customLlmUrl,
    correlation: {
      header: "x-fsp-session-id",
      body_fields: ["session_id", "metadata.session_id"],
    },
    message:
      "LiveAvatar session-token minting is not configured. Set required server environment variables.",
    missing_env: env.sessionTokenMissing.length
      ? env.sessionTokenMissing
      : env.missing,
  };
}

export async function createHeyGenSessionToken(
  input: unknown,
  deps: { fetchFn?: typeof fetch } = {},
): Promise<HeyGenSessionTokenSuccessResponse | HeyGenSessionTokenNotConfiguredResponse> {
  const parsed = CreateHeyGenSessionTokenRequestSchema.parse(input);
  sessionStore.require(parsed.fsp_session_id);

  const runtimeConfig = readLiveAvatarRuntimeConfig();
  if (!runtimeConfig) {
    return createHeyGenSessionTokenNotConfigured(input);
  }

  const minted = await mintLiveAvatarSessionToken(
    runtimeConfig,
    deps.fetchFn ?? fetch,
  );

  return {
    status: "ok",
    mode: "FULL",
    fsp_session_id: parsed.fsp_session_id,
    provider_session_id: minted.sessionId,
    session_token: minted.sessionToken,
    custom_llm_url: runtimeConfig.customLlmUrl,
    correlation: {
      header: "x-fsp-session-id",
      body_fields: ["session_id", "metadata.session_id"],
    },
  };
}

export { LiveAvatarApiError };
