export type LiveAvatarInteractivityMode = "PUSH_TO_TALK" | "CONVERSATIONAL";

export type LiveAvatarUiState =
  | "unconfigured"
  | "idle"
  | "starting"
  | "connected"
  | "stopping"
  | "error";

export type HeyGenBridgeStatus = {
  connected: boolean;
  session_token_configured: boolean;
  mode: "FULL";
  push_to_talk: string;
  interactivity_type?: LiveAvatarInteractivityMode;
  env: {
    sessionTokenConfigured: boolean;
    runtimeDefaults: {
      INTERACTIVITY_TYPE: LiveAvatarInteractivityMode;
      SANDBOX?: boolean;
      MAX_SESSION_SECONDS?: number;
    };
    runtimeResolved?: {
      INTERACTIVITY_TYPE: LiveAvatarInteractivityMode;
      SANDBOX: boolean;
      MAX_SESSION_SECONDS: number;
    } | null;
  };
};

export type HeyGenSessionTokenOk = {
  status: "ok";
  session_token: string;
  provider_session_id: string;
  fsp_session_id: string;
  interactivity_type?: LiveAvatarInteractivityMode;
  max_session_seconds?: number;
};

export type HeyGenSessionTokenNotConfigured = {
  status: "not_configured";
  missing_env: string[];
  message: string;
};

export type HeyGenSessionTokenError = {
  error: {
    code: string;
    message: string;
    debug?: {
      reason?: string;
      provider_status?: number;
      provider_code?: number | string | null;
      provider_message_prefix?: string | null;
      max_session_seconds?: number | null;
      request_id?: string;
    };
  };
};
