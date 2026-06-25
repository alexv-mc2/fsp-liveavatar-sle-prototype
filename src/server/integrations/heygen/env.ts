/**
 * Placeholder environment variable names for HeyGen LiveAvatar FULL Mode bridge readiness.
 * No secrets belong in source control. Values are read at runtime on the server only.
 *
 * ExpoWall (mcsq-expo-wall) uses LIVEAVATAR_* names; this repo accepts those as optional
 * local fallbacks so credentials are not duplicated during bridge testing.
 */
export const HEYGEN_ENV = {
  API_KEY: "HEYGEN_API_KEY",
  LIVEAVATAR_AVATAR_ID: "HEYGEN_LIVEAVATAR_AVATAR_ID",
  LIVEAVATAR_VOICE_ID: "HEYGEN_LIVEAVATAR_VOICE_ID",
  PUBLIC_BASE_URL: "FSP_PUBLIC_BASE_URL",
} as const;

/** Read-only alias names discovered in mcsq-expo-wall (values never logged). */
export const EXPO_WALL_LIVEAVATAR_ENV = {
  API_KEY: "LIVEAVATAR_API_KEY",
  AVATAR_ID: "LIVEAVATAR_AVATAR_ID",
  VOICE_ID: "LIVEAVATAR_VOICE_ID",
  CONTEXT_ID: "LIVEAVATAR_CONTEXT_ID",
  LLM_CONFIGURATION_ID: "LIVEAVATAR_LLM_CONFIGURATION_ID",
  BASE_URL: "LIVEAVATAR_BASE_URL",
  LANGUAGE: "LIVEAVATAR_LANGUAGE",
  INTERACTIVITY_TYPE: "LIVEAVATAR_INTERACTIVITY_TYPE",
  SANDBOX: "LIVEAVATAR_SANDBOX",
  MAX_SESSION_SECONDS: "LIVEAVATAR_MAX_SESSION_SECONDS",
  PUBLIC_ENABLED: "NEXT_PUBLIC_ERLEBE_WALBECK_AVATAR_ENABLED",
} as const;

export type HeyGenEnvSnapshot = {
  configured: boolean;
  missing: string[];
  publicBaseUrl: string | null;
  customLlmUrl: string | null;
  publicBaseUrlSource: "FSP_PUBLIC_BASE_URL" | "VERCEL_URL" | null;
  resolvedFrom: {
    apiKey: typeof HEYGEN_ENV.API_KEY | typeof EXPO_WALL_LIVEAVATAR_ENV.API_KEY | null;
    avatarId:
      | typeof HEYGEN_ENV.LIVEAVATAR_AVATAR_ID
      | typeof EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID
      | null;
    voiceId:
      | typeof HEYGEN_ENV.LIVEAVATAR_VOICE_ID
      | typeof EXPO_WALL_LIVEAVATAR_ENV.VOICE_ID
      | null;
  };
  expoWallAliasesPresent: Record<
    (typeof EXPO_WALL_LIVEAVATAR_ENV)[keyof typeof EXPO_WALL_LIVEAVATAR_ENV],
    boolean
  >;
};

function readTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizePublicBaseUrl(raw: string): string {
  const normalized = raw.replace(/\/+$/, "");
  return normalized.startsWith("http") ? normalized : `https://${normalized}`;
}

function resolvePublicBaseUrl(): {
  url: string | null;
  source: HeyGenEnvSnapshot["publicBaseUrlSource"];
} {
  const explicit = readTrimmed(HEYGEN_ENV.PUBLIC_BASE_URL);
  if (explicit) {
    return {
      url: normalizePublicBaseUrl(explicit),
      source: "FSP_PUBLIC_BASE_URL",
    };
  }

  const vercel = readTrimmed("VERCEL_URL");
  if (vercel) {
    return { url: normalizePublicBaseUrl(vercel), source: "VERCEL_URL" };
  }

  return { url: null, source: null };
}

function firstPresent(names: string[]): { value: string; name: string } | null {
  for (const name of names) {
    const value = readTrimmed(name);
    if (value) {
      return { value, name };
    }
  }
  return null;
}

export function readExpoWallAliasPresence(): HeyGenEnvSnapshot["expoWallAliasesPresent"] {
  return Object.fromEntries(
    Object.values(EXPO_WALL_LIVEAVATAR_ENV).map((name) => [
      name,
      Boolean(readTrimmed(name)),
    ]),
  ) as HeyGenEnvSnapshot["expoWallAliasesPresent"];
}

export function readHeyGenEnvSnapshot(): HeyGenEnvSnapshot {
  const apiKey = firstPresent([
    HEYGEN_ENV.API_KEY,
    EXPO_WALL_LIVEAVATAR_ENV.API_KEY,
  ]);
  const avatarId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_AVATAR_ID,
    EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID,
  ]);
  const voiceId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_VOICE_ID,
    EXPO_WALL_LIVEAVATAR_ENV.VOICE_ID,
  ]);

  const { url: publicBaseUrl, source: publicBaseUrlSource } =
    resolvePublicBaseUrl();

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
    customLlmUrl: publicBaseUrl ? buildCustomLlmUrl(publicBaseUrl) : null,
    publicBaseUrlSource,
    resolvedFrom: {
      apiKey: (apiKey?.name as HeyGenEnvSnapshot["resolvedFrom"]["apiKey"]) ?? null,
      avatarId:
        (avatarId?.name as HeyGenEnvSnapshot["resolvedFrom"]["avatarId"]) ?? null,
      voiceId:
        (voiceId?.name as HeyGenEnvSnapshot["resolvedFrom"]["voiceId"]) ?? null,
    },
    expoWallAliasesPresent: readExpoWallAliasPresence(),
  };
}

export function buildCustomLlmUrl(publicBaseUrl: string): string {
  const normalized = publicBaseUrl.replace(/\/+$/, "");
  return `${normalized}/v1/chat/completions`;
}
