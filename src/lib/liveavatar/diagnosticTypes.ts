export type DiagnosticInteractivityMode = "PUSH_TO_TALK" | "CONVERSATIONAL";

export type DiagnosticBreakpoint =
  | "TOKEN_FAIL"
  | "SDK_START_FAIL"
  | "VIDEO_FAIL"
  | "MIC_FAIL"
  | "NO_OUTBOUND_AUDIO"
  | "NO_LLM_CALLBACK"
  | "LLM_400"
  | "LLM_200_NO_CONTENT"
  | "LLM_200_CONTENT_NO_AUDIO"
  | "PLAYBACK_MUTED"
  | "AVATAR_RESPONDED"
  | "UNKNOWN";

export type DiagnosticEvent = {
  ts: string;
  phase: string;
  source?: "client" | "server";
  request_id?: string;
  payload?: Record<string, unknown>;
};

export type DiagnosticRun = {
  runId: string;
  startedAt: string;
  endedAt?: string;
  interactivityType?: string;
  fspSessionIdPrefix?: string;
  providerSessionIdPrefix?: string;
  events: DiagnosticEvent[];
  classification?: DiagnosticBreakpoint;
};

export const FSP_DIAGNOSTIC_RUN_HEADER = "x-fsp-diagnostic-run-id";
