import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as heygenSessionTokenPost } from "@/app/api/integrations/heygen/session-token/route";
import { GET as heygenStatusGet } from "@/app/api/integrations/heygen/status/route";
import {
  EXPO_WALL_LIVEAVATAR_ENV,
  HEYGEN_ENV,
  LIVEAVATAR_DEFAULTS,
  readHeyGenEnvSnapshot,
  readLiveAvatarRuntimeConfig,
} from "@/server/integrations/heygen/env";
import {
  buildCreateSessionTokenBody,
  mintLiveAvatarSessionToken,
} from "@/server/integrations/heygen/liveAvatarApi";
import {
  createHeyGenSessionToken,
  getHeyGenIntegrationStatus,
} from "@/server/integrations/heygen/sessionToken";
import { loadScenario } from "@/server/fsp/scenarioLoader";
import { sessionStore } from "@/server/fsp/scenarioState";

const scenario = loadScenario();

const TEST_IDS = {
  avatar: "11111111-1111-4111-8111-111111111111",
  context: "22222222-2222-4222-8222-222222222222",
  llm: "33333333-3333-4333-8333-333333333333",
  voice: "44444444-4444-4444-8444-444444444444",
  providerSession: "55555555-5555-4555-8555-555555555555",
};

function clearLiveAvatarEnv() {
  const names = [
    HEYGEN_ENV.API_KEY,
    HEYGEN_ENV.LIVEAVATAR_AVATAR_ID,
    HEYGEN_ENV.LIVEAVATAR_VOICE_ID,
    HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID,
    HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID,
    HEYGEN_ENV.PUBLIC_BASE_URL,
    ...Object.values(EXPO_WALL_LIVEAVATAR_ENV),
    "VERCEL_URL",
    "VERCEL_ENV",
  ];
  for (const name of names) {
    delete process.env[name];
  }
}

function setConfiguredLiveAvatarEnv(useAliases = false, includeContext = true) {
  process.env[useAliases ? EXPO_WALL_LIVEAVATAR_ENV.API_KEY : HEYGEN_ENV.API_KEY] =
    "test-api-key";
  process.env[
    useAliases ? EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID : HEYGEN_ENV.LIVEAVATAR_AVATAR_ID
  ] = TEST_IDS.avatar;
  if (includeContext) {
    process.env[
      useAliases ? EXPO_WALL_LIVEAVATAR_ENV.CONTEXT_ID : HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID
    ] = TEST_IDS.context;
  }
  process.env[
    useAliases
      ? EXPO_WALL_LIVEAVATAR_ENV.LLM_CONFIGURATION_ID
      : HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID
  ] = TEST_IDS.llm;
  process.env[
    useAliases ? EXPO_WALL_LIVEAVATAR_ENV.VOICE_ID : HEYGEN_ENV.LIVEAVATAR_VOICE_ID
  ] = TEST_IDS.voice;
  process.env[HEYGEN_ENV.PUBLIC_BASE_URL] =
    "https://fsp-liveavatar-sle-prototype.vercel.app";
}

beforeEach(() => {
  clearLiveAvatarEnv();
  sessionStore.clear();
});

describe("LiveAvatar env resolution", () => {
  it("reports session token missing env with canonical HEYGEN names", () => {
    const env = readHeyGenEnvSnapshot();
    expect(env.sessionTokenConfigured).toBe(false);
    expect(env.sessionTokenMissing).toEqual([
      HEYGEN_ENV.API_KEY,
      HEYGEN_ENV.LIVEAVATAR_AVATAR_ID,
      HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID,
    ]);
  });

  it("considers session token configured without context_id", () => {
    setConfiguredLiveAvatarEnv(false, false);
    const env = readHeyGenEnvSnapshot();
    expect(env.sessionTokenConfigured).toBe(true);
    expect(env.sessionTokenMissing).toEqual([]);
    expect(env.resolvedFrom.contextId).toBeNull();

    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime?.contextId).toBeNull();
  });

  it("accepts ExpoWall LIVEAVATAR_* aliases for runtime config", () => {
    setConfiguredLiveAvatarEnv(true);
    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime).not.toBeNull();
    expect(runtime?.resolvedFrom.apiKey).toBe(EXPO_WALL_LIVEAVATAR_ENV.API_KEY);
    expect(runtime?.language).toBe(LIVEAVATAR_DEFAULTS.LANGUAGE);
    expect(runtime?.interactivityType).toBe(LIVEAVATAR_DEFAULTS.INTERACTIVITY_TYPE);
    expect(runtime?.maxSessionSeconds).toBe(LIVEAVATAR_DEFAULTS.MAX_SESSION_SECONDS);
    expect(runtime?.sandbox).toBe(LIVEAVATAR_DEFAULTS.SANDBOX);
  });

  it("honors LIVEAVATAR_INTERACTIVITY_TYPE=CONVERSATIONAL", () => {
    setConfiguredLiveAvatarEnv(false);
    process.env[EXPO_WALL_LIVEAVATAR_ENV.INTERACTIVITY_TYPE] = "CONVERSATIONAL";
    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime?.interactivityType).toBe("CONVERSATIONAL");
    const body = buildCreateSessionTokenBody(runtime!);
    expect(body.interactivity_type).toBe("CONVERSATIONAL");
  });
});

describe("LiveAvatar session token request body", () => {
  it("builds FULL Mode payload with defaults", () => {
    setConfiguredLiveAvatarEnv(false);
    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime).not.toBeNull();

    const body = buildCreateSessionTokenBody(runtime!);
    expect(body).toEqual({
      mode: "FULL",
      avatar_id: TEST_IDS.avatar,
      is_sandbox: true,
      max_session_duration: 1200,
      interactivity_type: "PUSH_TO_TALK",
      llm_configuration_id: TEST_IDS.llm,
      avatar_persona: {
        context_id: TEST_IDS.context,
        language: "de",
        voice_id: TEST_IDS.voice,
      },
    });
  });

  it("omits context_id from avatar_persona when unset", () => {
    setConfiguredLiveAvatarEnv(false, false);
    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime).not.toBeNull();

    const body = buildCreateSessionTokenBody(runtime!);
    expect(body.avatar_persona).toEqual({
      language: "de",
      voice_id: TEST_IDS.voice,
    });
    expect(body.avatar_persona).not.toHaveProperty("context_id");
  });

  it("includes dynamic_variables when fsp_session_id is provided at mint time", () => {
    setConfiguredLiveAvatarEnv(false);
    const runtime = readLiveAvatarRuntimeConfig();
    expect(runtime).not.toBeNull();

    const fspSessionId = "11111111-1111-4111-8111-111111111111";
    const body = buildCreateSessionTokenBody(runtime!, { fspSessionId });
    expect(body.dynamic_variables).toEqual({
      fsp_session_id: fspSessionId,
      case_id: "fsp-nrw-sle",
    });
  });
});

describe("LiveAvatar session token minting", () => {
  it("mints token via mocked fetch without logging api key in thrown errors", async () => {
    setConfiguredLiveAvatarEnv(false);
    const runtime = readLiveAvatarRuntimeConfig()!;

    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["X-API-KEY"]).toBe("test-api-key");
      const parsed = JSON.parse(String(init?.body));
      expect(parsed.llm_configuration_id).toBe(TEST_IDS.llm);
      expect(parsed.avatar_persona.context_id).toBe(TEST_IDS.context);

      return new Response(
        JSON.stringify({
          data: {
            session_id: TEST_IDS.providerSession,
            session_token: "provider-session-token-value",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await mintLiveAvatarSessionToken(runtime, fetchFn);
    expect(result.sessionId).toBe(TEST_IDS.providerSession);
    expect(result.sessionToken).toBe("provider-session-token-value");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("normalizes provider 4xx failures to 502 without leaking provider message", async () => {
    setConfiguredLiveAvatarEnv(false);
    const runtime = readLiveAvatarRuntimeConfig()!;

    const fetchFn = vi.fn(async () =>
      Response.json(
        { message: "Invalid API key secret-value-leak" },
        { status: 401 },
      ),
    );

    await expect(mintLiveAvatarSessionToken(runtime, fetchFn)).rejects.toMatchObject({
      status: 502,
      message: "LiveAvatar session token request failed.",
    });
  });

  it("createHeyGenSessionToken returns ok payload with mocked provider", async () => {
    setConfiguredLiveAvatarEnv(false);
    const fspSession = sessionStore.create(scenario);

    const fetchFn = vi.fn(async () =>
      Response.json({
        data: {
          session_id: TEST_IDS.providerSession,
          session_token: "provider-session-token-value",
        },
      }),
    );

    const payload = await createHeyGenSessionToken(
      { fsp_session_id: fspSession.id },
      { fetchFn },
    );

    expect(payload.status).toBe("ok");
    if (payload.status === "ok") {
      expect(payload.fsp_session_id).toBe(fspSession.id);
      expect(payload.provider_session_id).toBe(TEST_IDS.providerSession);
      expect(payload.session_token).toBe("provider-session-token-value");
      expect(payload.custom_llm_url).toBe(
        "https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions",
      );
    }

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("test-api-key");
  });
});

describe("LiveAvatar session token route", () => {
  it("POST /api/integrations/heygen/session-token fails closed without env", async () => {
    const fspSession = sessionStore.create(scenario);
    const response = await heygenSessionTokenPost(
      new Request("http://localhost/api/integrations/heygen/session-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fsp_session_id: fspSession.id }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_configured");
    expect(body.missing_env).toContain(HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID);
    expect(JSON.stringify(body)).not.toContain("test-api-key");
  });

  it("GET /api/integrations/heygen/status exposes session_token_configured boolean", async () => {
    const response = await heygenStatusGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session_token_configured).toBe(false);
    expect(body.bridge.liveavatar_runtime).toBe("session_token_api");
  });

  it("GET status reports configured when session env is complete", async () => {
    setConfiguredLiveAvatarEnv(false, false);
    const status = getHeyGenIntegrationStatus();
    expect(status.session_token_configured).toBe(true);
    expect(status.connected).toBe(true);
    expect(status.bridge.heygen_context_policy).toBe(
      "context_id_optional_backend_owns_fsp_context",
    );
  });

  it("GET status exposes resolved interactivity_type from env", async () => {
    setConfiguredLiveAvatarEnv(false, false);
    process.env[EXPO_WALL_LIVEAVATAR_ENV.INTERACTIVITY_TYPE] = "CONVERSATIONAL";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.SANDBOX] = "false";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.MAX_SESSION_SECONDS] = "300";

    const status = getHeyGenIntegrationStatus();
    expect(status.interactivity_type).toBe("CONVERSATIONAL");
    expect(status.env.runtimeResolved).toEqual({
      INTERACTIVITY_TYPE: "CONVERSATIONAL",
      SANDBOX: false,
      MAX_SESSION_SECONDS: 300,
      LANGUAGE: LIVEAVATAR_DEFAULTS.LANGUAGE,
    });
  });

  it("raises short Preview manual-review sessions without changing Production env semantics", () => {
    setConfiguredLiveAvatarEnv(false, false);
    process.env.VERCEL_ENV = "preview";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.MAX_SESSION_SECONDS] = "300";

    expect(readLiveAvatarRuntimeConfig()?.maxSessionSeconds).toBe(1080);
    expect(readHeyGenEnvSnapshot().envPolicy?.maxSessionSecondsReason).toBe(
      "preview_manual_review_minimum",
    );

    process.env.VERCEL_ENV = "production";
    expect(readLiveAvatarRuntimeConfig()?.maxSessionSeconds).toBe(300);
    expect(readHeyGenEnvSnapshot().envPolicy?.maxSessionSecondsReason).toBeNull();
  });
});
