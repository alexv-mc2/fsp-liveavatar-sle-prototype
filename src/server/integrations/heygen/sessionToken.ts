import { z } from "zod";
import { sessionStore } from "../../fsp/scenarioState";
import {
  buildCustomLlmUrl,
  readHeyGenEnvSnapshot,
  readLiveAvatarRuntimeConfig,
  type HeyGenEnvSnapshot,
  type LiveAvatarInteractivityType,
} from "./env";
import { buildRouteProofSnapshot } from "../../debug/routeProof";
import {
  fetchLiveAvatarLlmConfigurationBaseUrl,
  LiveAvatarApiError,
  mintLiveAvatarSessionToken,
  type LiveAvatarTokenRequestDiagnostics,
} from "./liveAvatarApi";

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
  interactivity_type: "PUSH_TO_TALK" | "CONVERSATIONAL";
  max_session_seconds: number;
  correlation: {
    header: "x-fsp-session-id";
    body_fields: ["session_id", "metadata.session_id"];
  };
  route_proof: ReturnType<typeof buildRouteProofSnapshot>;
}

export async function enrichHeyGenStatusRouteProof(
  status: ReturnType<typeof getHeyGenIntegrationStatus>,
): Promise<ReturnType<typeof getHeyGenIntegrationStatus>> {
  const runtime = readLiveAvatarRuntimeConfig();
  if (!runtime) {
    return status;
  }

  const llmConfigBaseUrl = await fetchLiveAvatarLlmConfigurationBaseUrl(runtime);
  return {
    ...status,
    route_proof: buildRouteProofSnapshot({
      llmConfigurationId: runtime.llmConfigurationId,
      llmConfigBaseUrl: llmConfigBaseUrl,
      llmEnvSource: status.env.resolvedFrom.llmConfigurationId ?? null,
    }),
  };
}

export function getHeyGenIntegrationStatus(): {
  connected: boolean;
  configured: boolean;
  session_token_configured: boolean;
  mode: "FULL";
  custom_llm_path: "/v1/chat/completions";
  custom_llm_compat_path: "/chat/completions";
  streaming: "openai_sse";
  push_to_talk: "browser_sdk";
  interactivity_type: LiveAvatarInteractivityType;
  env: HeyGenEnvSnapshot;
  route_proof: ReturnType<typeof buildRouteProofSnapshot>;
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
  const runtime = readLiveAvatarRuntimeConfig();
  const routeProof = buildRouteProofSnapshot({
    llmConfigurationId: runtime?.llmConfigurationId ?? null,
    llmEnvSource: env.resolvedFrom.llmConfigurationId ?? null,
  });
  return {
    connected: env.sessionTokenConfigured,
    configured: env.configured,
    session_token_configured: env.sessionTokenConfigured,
    mode: "FULL",
    custom_llm_path: "/v1/chat/completions",
    custom_llm_compat_path: "/chat/completions",
    streaming: "openai_sse",
    push_to_talk: "browser_sdk",
    interactivity_type:
      runtime?.interactivityType ?? env.runtimeDefaults.INTERACTIVITY_TYPE,
    env,
    route_proof: routeProof,
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
  deps: {
    fetchFn?: typeof fetch;
    onDiagnostics?: (event: LiveAvatarTokenRequestDiagnostics) => void;
  } = {},
): Promise<HeyGenSessionTokenSuccessResponse | HeyGenSessionTokenNotConfiguredResponse> {
  const parsed = CreateHeyGenSessionTokenRequestSchema.parse(input);
  const sessionPresent = Boolean(sessionStore.get(parsed.fsp_session_id));
  deps.onDiagnostics?.({
    phase: "session_token_session_lookup",
    payload: {
      session_present: sessionPresent,
      session_id_prefix: parsed.fsp_session_id.slice(0, 8),
      persistence: "in_memory_optional_for_liveavatar_token",
    },
  });

  const runtimeConfig = readLiveAvatarRuntimeConfig();
  if (!runtimeConfig) {
    return createHeyGenSessionTokenNotConfigured(input);
  }

  const minted = await mintLiveAvatarSessionToken(
    runtimeConfig,
    deps.fetchFn ?? fetch,
    {
      fspSessionId: parsed.fsp_session_id,
      onDiagnostics: deps.onDiagnostics,
    },
  );

  const llmConfigBaseUrl =
    await fetchLiveAvatarLlmConfigurationBaseUrl(runtimeConfig);

  return {
    status: "ok",
    mode: "FULL",
    fsp_session_id: parsed.fsp_session_id,
    provider_session_id: minted.sessionId,
    session_token: minted.sessionToken,
    custom_llm_url: runtimeConfig.customLlmUrl,
    interactivity_type: runtimeConfig.interactivityType,
    max_session_seconds: minted.maxSessionSeconds,
    correlation: {
      header: "x-fsp-session-id",
      body_fields: ["session_id", "metadata.session_id"],
    },
    route_proof: buildRouteProofSnapshot({
      llmConfigurationId: runtimeConfig.llmConfigurationId,
      llmConfigBaseUrl,
      llmEnvSource: runtimeConfig.resolvedFrom.llmConfigurationId,
    }),
  };
}

export { LiveAvatarApiError };
