/**
 * Placeholder environment variable names for a future HeyGen LiveAvatar FULL Mode spike.
 * No secrets belong in source control. Values are read at runtime on the server only.
 */
export const HEYGEN_ENV = {
  API_KEY: "HEYGEN_API_KEY",
  LIVEAVATAR_AVATAR_ID: "HEYGEN_LIVEAVATAR_AVATAR_ID",
  LIVEAVATAR_VOICE_ID: "HEYGEN_LIVEAVATAR_VOICE_ID",
  PUBLIC_BASE_URL: "FSP_PUBLIC_BASE_URL",
} as const;

export type HeyGenEnvSnapshot = {
  configured: boolean;
  missing: string[];
  publicBaseUrl: string | null;
};

export function readHeyGenEnvSnapshot(): HeyGenEnvSnapshot {
  const apiKey = process.env[HEYGEN_ENV.API_KEY]?.trim();
  const avatarId = process.env[HEYGEN_ENV.LIVEAVATAR_AVATAR_ID]?.trim();
  const publicBaseUrl = process.env[HEYGEN_ENV.PUBLIC_BASE_URL]?.trim() ?? null;

  const missing: string[] = [];
  if (!apiKey) {
    missing.push(HEYGEN_ENV.API_KEY);
  }
  if (!avatarId) {
    missing.push(HEYGEN_ENV.LIVEAVATAR_AVATAR_ID);
  }
  if (!publicBaseUrl) {
    missing.push(HEYGEN_ENV.PUBLIC_BASE_URL);
  }

  return {
    configured: missing.length === 0,
    missing,
    publicBaseUrl,
  };
}

export function buildCustomLlmUrl(publicBaseUrl: string): string {
  const normalized = publicBaseUrl.replace(/\/+$/, "");
  return `${normalized}/v1/chat/completions`;
}
