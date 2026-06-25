import { z } from "zod";
import { sessionStore } from "../../fsp/scenarioState";
import {
  buildCustomLlmUrl,
  readHeyGenEnvSnapshot,
  type HeyGenEnvSnapshot,
} from "./env";

export const CreateHeyGenSessionTokenRequestSchema = z.object({
  fsp_session_id: z.string().uuid(),
});

export type CreateHeyGenSessionTokenRequest = z.infer<
  typeof CreateHeyGenSessionTokenRequestSchema
>;

export interface HeyGenSessionTokenContractResponse {
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

export function getHeyGenIntegrationStatus(): {
  connected: false;
  configured: boolean;
  mode: "FULL";
  custom_llm_path: "/v1/chat/completions";
  custom_llm_compat_path: "/chat/completions";
  streaming: "not_implemented";
  push_to_talk: "not_implemented";
  env: HeyGenEnvSnapshot;
} {
  const env = readHeyGenEnvSnapshot();
  return {
    connected: false,
    configured: env.configured,
    mode: "FULL",
    custom_llm_path: "/v1/chat/completions",
    custom_llm_compat_path: "/chat/completions",
    streaming: "not_implemented",
    push_to_talk: "not_implemented",
    env,
  };
}

export function createHeyGenSessionTokenNotConfigured(
  input: unknown,
): HeyGenSessionTokenContractResponse {
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
      "HeyGen LiveAvatar is not connected. Session-token minting requires verified provider credentials and a future implementation PR.",
    missing_env: env.missing,
  };
}
