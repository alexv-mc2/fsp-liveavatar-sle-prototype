/**
 * Placeholder environment variable names for HeyGen LiveAvatar FULL Mode bridge readiness.
 * No secrets belong in source control. Values are read at runtime on the server only.
 *
 * ExpoWall (mcsq-expo-wall) uses LIVEAVATAR_* names; this repo accepts those as optional
 * local fallbacks so credentials are not duplicated during bridge testing.
 */
import { LIVEAVATAR_API_DEFAULT_BASE_URL } from "./liveAvatarApi";

export const HEYGEN_ENV = {
  API_KEY: "HEYGEN_API_KEY",
  LIVEAVATAR_AVATAR_ID: "HEYGEN_LIVEAVATAR_AVATAR_ID",
  LIVEAVATAR_VOICE_ID: "HEYGEN_LIVEAVATAR_VOICE_ID",
  LIVEAVATAR_CONTEXT_ID: "HEYGEN_LIVEAVATAR_CONTEXT_ID",
  LIVEAVATAR_LLM_CONFIGURATION_ID: "HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID",
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

export const LIVEAVATAR_DEFAULTS = {
  LANGUAGE: "de",
  INTERACTIVITY_TYPE: "PUSH_TO_TALK",
  MAX_SESSION_SECONDS: 1200,
  SANDBOX: true,
} as const;

export type LiveAvatarInteractivityType = "PUSH_TO_TALK" | "CONVERSATIONAL";

export type LiveAvatarRuntimeConfig = {
  apiKey: string;
  avatarId: string;
  contextId: string;
  llmConfigurationId: string;
  voiceId: string | null;
  apiBaseUrl: string;
  language: string;
  interactivityType: LiveAvatarInteractivityType;
  maxSessionSeconds: number;
  sandbox: boolean;
  publicBaseUrl: string | null;
  customLlmUrl: string | null;
  resolvedFrom: {
    apiKey: string;
    avatarId: string;
    contextId: string;
    llmConfigurationId: string;
    voiceId: string | null;
  };
};

export type HeyGenEnvSnapshot = {
  configured: boolean;
  missing: string[];
  sessionTokenConfigured: boolean;
  sessionTokenMissing: string[];
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
    contextId:
      | typeof HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID
      | typeof EXPO_WALL_LIVEAVATAR_ENV.CONTEXT_ID
      | null;
    llmConfigurationId:
      | typeof HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID
      | typeof EXPO_WALL_LIVEAVATAR_ENV.LLM_CONFIGURATION_ID
      | null;
  };
  expoWallAliasesPresent: Record<
    (typeof EXPO_WALL_LIVEAVATAR_ENV)[keyof typeof EXPO_WALL_LIVEAVATAR_ENV],
    boolean
  >;
  runtimeDefaults: typeof LIVEAVATAR_DEFAULTS;
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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseInteractivityType(
  value: string | undefined,
): LiveAvatarInteractivityType {
  if (value?.toUpperCase() === "CONVERSATIONAL") {
    return "CONVERSATIONAL";
  }
  return LIVEAVATAR_DEFAULTS.INTERACTIVITY_TYPE;
}

export function readExpoWallAliasPresence(): HeyGenEnvSnapshot["expoWallAliasesPresent"] {
  return Object.fromEntries(
    Object.values(EXPO_WALL_LIVEAVATAR_ENV).map((name) => [
      name,
      Boolean(readTrimmed(name)),
    ]),
  ) as HeyGenEnvSnapshot["expoWallAliasesPresent"];
}

function collectSessionTokenMissing(
  apiKey: ReturnType<typeof firstPresent>,
  avatarId: ReturnType<typeof firstPresent>,
  contextId: ReturnType<typeof firstPresent>,
  llmConfigurationId: ReturnType<typeof firstPresent>,
): string[] {
  const missing: string[] = [];
  if (!apiKey) {
    missing.push(HEYGEN_ENV.API_KEY);
  }
  if (!avatarId) {
    missing.push(HEYGEN_ENV.LIVEAVATAR_AVATAR_ID);
  }
  if (!contextId) {
    missing.push(HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID);
  }
  if (!llmConfigurationId) {
    missing.push(HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID);
  }
  return missing;
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
  const contextId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID,
    EXPO_WALL_LIVEAVATAR_ENV.CONTEXT_ID,
  ]);
  const llmConfigurationId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID,
    EXPO_WALL_LIVEAVATAR_ENV.LLM_CONFIGURATION_ID,
  ]);

  const { url: publicBaseUrl, source: publicBaseUrlSource } =
    resolvePublicBaseUrl();

  const sessionTokenMissing = collectSessionTokenMissing(
    apiKey,
    avatarId,
    contextId,
    llmConfigurationId,
  );

  const bridgeMissing: string[] = [...sessionTokenMissing];
  if (!publicBaseUrl) {
    bridgeMissing.push(HEYGEN_ENV.PUBLIC_BASE_URL);
  }

  return {
    configured: bridgeMissing.length === 0,
    missing: bridgeMissing,
    sessionTokenConfigured: sessionTokenMissing.length === 0,
    sessionTokenMissing,
    publicBaseUrl,
    customLlmUrl: publicBaseUrl ? buildCustomLlmUrl(publicBaseUrl) : null,
    publicBaseUrlSource,
    resolvedFrom: {
      apiKey: (apiKey?.name as HeyGenEnvSnapshot["resolvedFrom"]["apiKey"]) ?? null,
      avatarId:
        (avatarId?.name as HeyGenEnvSnapshot["resolvedFrom"]["avatarId"]) ?? null,
      voiceId:
        (voiceId?.name as HeyGenEnvSnapshot["resolvedFrom"]["voiceId"]) ?? null,
      contextId:
        (contextId?.name as HeyGenEnvSnapshot["resolvedFrom"]["contextId"]) ?? null,
      llmConfigurationId:
        (llmConfigurationId?.name as HeyGenEnvSnapshot["resolvedFrom"]["llmConfigurationId"]) ??
        null,
    },
    expoWallAliasesPresent: readExpoWallAliasPresence(),
    runtimeDefaults: LIVEAVATAR_DEFAULTS,
  };
}

export function readLiveAvatarRuntimeConfig(): LiveAvatarRuntimeConfig | null {
  const snapshot = readHeyGenEnvSnapshot();
  if (!snapshot.sessionTokenConfigured) {
    return null;
  }

  const apiKey = firstPresent([
    HEYGEN_ENV.API_KEY,
    EXPO_WALL_LIVEAVATAR_ENV.API_KEY,
  ])!;
  const avatarId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_AVATAR_ID,
    EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID,
  ])!;
  const contextId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID,
    EXPO_WALL_LIVEAVATAR_ENV.CONTEXT_ID,
  ])!;
  const llmConfigurationId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID,
    EXPO_WALL_LIVEAVATAR_ENV.LLM_CONFIGURATION_ID,
  ])!;
  const voiceId = firstPresent([
    HEYGEN_ENV.LIVEAVATAR_VOICE_ID,
    EXPO_WALL_LIVEAVATAR_ENV.VOICE_ID,
  ]);

  const apiBaseUrl =
    readTrimmed(EXPO_WALL_LIVEAVATAR_ENV.BASE_URL) ??
    LIVEAVATAR_API_DEFAULT_BASE_URL;

  return {
    apiKey: apiKey.value,
    avatarId: avatarId.value,
    contextId: contextId.value,
    llmConfigurationId: llmConfigurationId.value,
    voiceId: voiceId?.value ?? null,
    apiBaseUrl,
    language: readTrimmed(EXPO_WALL_LIVEAVATAR_ENV.LANGUAGE) ?? LIVEAVATAR_DEFAULTS.LANGUAGE,
    interactivityType: parseInteractivityType(
      readTrimmed(EXPO_WALL_LIVEAVATAR_ENV.INTERACTIVITY_TYPE),
    ),
    maxSessionSeconds: parsePositiveInteger(
      readTrimmed(EXPO_WALL_LIVEAVATAR_ENV.MAX_SESSION_SECONDS),
      LIVEAVATAR_DEFAULTS.MAX_SESSION_SECONDS,
    ),
    sandbox: parseBoolean(
      readTrimmed(EXPO_WALL_LIVEAVATAR_ENV.SANDBOX),
      LIVEAVATAR_DEFAULTS.SANDBOX,
    ),
    publicBaseUrl: snapshot.publicBaseUrl,
    customLlmUrl: snapshot.customLlmUrl,
    resolvedFrom: {
      apiKey: apiKey.name,
      avatarId: avatarId.name,
      contextId: contextId.name,
      llmConfigurationId: llmConfigurationId.name,
      voiceId: voiceId?.name ?? null,
    },
  };
}

export function buildCustomLlmUrl(publicBaseUrl: string): string {
  const normalized = publicBaseUrl.replace(/\/+$/, "");
  return `${normalized}/v1/chat/completions`;
}

/** Base URL passed to LiveAvatar LLM Configurations API (OpenAI /chat/completions suffix). */
export function buildLiveAvatarLlmConfigBaseUrl(publicBaseUrl: string): string {
  const normalized = normalizePublicBaseUrl(publicBaseUrl).replace(/\/+$/, "");
  return `${normalized}/v1`;
}
