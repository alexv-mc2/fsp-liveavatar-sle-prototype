export type SanitizedTokenClaims = {
  mode?: string;
  agent_type?: string;
  is_sandbox?: boolean;
  voice_id_prefix?: string;
  avatar_id_prefix?: string;
  interactivity_type?: string;
};

export function decodeSessionTokenClaimsSanitized(
  token: string,
): SanitizedTokenClaims | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart || typeof atob !== "function") {
    return null;
  }

  try {
    const pad =
      payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const normalized = pad.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as {
      start_session_data?: Record<string, unknown>;
    };
    const ssd = payload.start_session_data ?? {};

    return {
      mode: typeof ssd.mode === "string" ? ssd.mode : undefined,
      agent_type: typeof ssd.agent_type === "string" ? ssd.agent_type : undefined,
      is_sandbox:
        typeof ssd.is_sandbox === "boolean" ? ssd.is_sandbox : undefined,
      voice_id_prefix:
        typeof ssd.voice_id === "string" ? `${ssd.voice_id.slice(0, 8)}…` : undefined,
      avatar_id_prefix:
        typeof ssd.avatar_id === "string"
          ? `${ssd.avatar_id.slice(0, 8)}…`
          : undefined,
      interactivity_type:
        typeof ssd.interactivity_type === "string"
          ? ssd.interactivity_type
          : undefined,
    };
  } catch {
    return null;
  }
}
