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
  env: {
    sessionTokenConfigured: boolean;
    runtimeDefaults: {
      INTERACTIVITY_TYPE: "PUSH_TO_TALK" | "CONVERSATIONAL";
    };
  };
};

export type HeyGenSessionTokenOk = {
  status: "ok";
  session_token: string;
  provider_session_id: string;
  fsp_session_id: string;
};

export type HeyGenSessionTokenNotConfigured = {
  status: "not_configured";
  missing_env: string[];
  message: string;
};

export type HeyGenSessionTokenError = {
  error: { code: string; message: string };
};
