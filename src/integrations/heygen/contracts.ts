/**
 * Provider-neutral boundary for HeyGen LiveAvatar FULL Mode.
 * Concrete provider fields must be verified against current HeyGen docs before use.
 * No credentials or undocumented assumptions belong in this module.
 */

export const HEYGEN_INTEGRATION_MODE = "FULL" as const;

/** Header the Custom LLM callback should receive for FSP session correlation. */
export const FSP_SESSION_HEADER = "x-fsp-session-id" as const;

/** OpenAI-compatible Custom LLM paths exposed by this app. */
export const CUSTOM_LLM_PATHS = {
  primary: "/v1/chat/completions",
  compatibility: "/chat/completions",
} as const;

/** Request body fields HeyGen / the avatar runtime may use to pass FSP session id. */
export const CUSTOM_LLM_SESSION_FIELDS = [
  "session_id",
  "metadata.session_id",
] as const;

export interface CustomLlmRequestMetadata {
  session_id?: string;
  fsp_phase?: string;
  case_id?: "fsp-nrw-sle";
  source?: "heygen_liveavatar";
}

export interface LiveAvatarSessionDescriptor {
  providerSessionId: string;
  fspSessionId: string;
}

export type LiveAvatarEvent =
  | { type: "transcript.partial"; text: string; providerEventId?: string }
  | { type: "transcript.final"; text: string; providerEventId?: string }
  | { type: "avatar.started_speaking" }
  | { type: "avatar.stopped_speaking" }
  | { type: "session.closed"; reason?: string }
  | { type: "session.error"; message: string };

/** Future client adapter surface (browser). Token minting stays server-side. */
export interface HeyGenLiveAvatarAdapter {
  createSessionToken(fspSessionId: string): Promise<string>;
  startFullModeSession(
    token: string,
    fspSessionId: string,
  ): Promise<LiveAvatarSessionDescriptor>;
  startPushToTalk(): Promise<void>;
  stopPushToTalk(): Promise<void>;
  subscribe(listener: (event: LiveAvatarEvent) => void): () => void;
  stopSession(): Promise<void>;
  deleteSessionEvents(providerSessionId: string): Promise<void>;
}

/** Documented failure modes for the future integration spike. */
export type HeyGenFailureMode =
  | "not_configured"
  | "token_mint_failed"
  | "session_start_failed"
  | "custom_llm_unreachable"
  | "custom_llm_timeout"
  | "session_correlation_missing"
  | "streaming_not_supported"
  | "ptt_not_supported"
  | "provider_session_stop_failed"
  | "provider_event_delete_unverified";
