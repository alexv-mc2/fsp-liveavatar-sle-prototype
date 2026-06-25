import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPO_WALL_LIVEAVATAR_ENV,
  HEYGEN_ENV,
  buildCustomLlmUrl,
  readHeyGenEnvSnapshot,
} from "@/server/integrations/heygen/env";
import { getHeyGenIntegrationStatus } from "@/server/integrations/heygen/sessionToken";

const REPO_ROOT = join(import.meta.dirname, "..");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".git" ||
      entry === "coverage"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|md|yaml|yml|json)$/.test(entry) && !entry.endsWith(".lock")) {
      acc.push(full);
    }
  }
  return acc;
}

function clearBridgeEnv() {
  const names = [
    HEYGEN_ENV.API_KEY,
    HEYGEN_ENV.LIVEAVATAR_AVATAR_ID,
    HEYGEN_ENV.LIVEAVATAR_VOICE_ID,
    HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID,
    HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID,
    HEYGEN_ENV.PUBLIC_BASE_URL,
    ...Object.values(EXPO_WALL_LIVEAVATAR_ENV),
    "VERCEL_URL",
  ];
  for (const name of names) {
    delete process.env[name];
  }
}

beforeEach(() => {
  clearBridgeEnv();
});

describe("env and bridge readiness", () => {
  it("buildCustomLlmUrl normalizes trailing slashes", () => {
    expect(buildCustomLlmUrl("https://example.vercel.app/")).toBe(
      "https://example.vercel.app/v1/chat/completions",
    );
  });

  it("readHeyGenEnvSnapshot prepends https:// to FSP_PUBLIC_BASE_URL without scheme", () => {
    process.env[HEYGEN_ENV.PUBLIC_BASE_URL] = "fsp-liveavatar.example.com";
    process.env[HEYGEN_ENV.API_KEY] = "test-key";
    process.env[HEYGEN_ENV.LIVEAVATAR_AVATAR_ID] = "test-avatar";
    process.env[HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID] = "test-context";
    process.env[HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID] = "test-llm";

    const env = readHeyGenEnvSnapshot();

    expect(env.publicBaseUrl).toBe("https://fsp-liveavatar.example.com");
    expect(env.publicBaseUrlSource).toBe("FSP_PUBLIC_BASE_URL");
    expect(env.customLlmUrl).toBe(
      "https://fsp-liveavatar.example.com/v1/chat/completions",
    );
    expect(env.configured).toBe(true);
    expect(env.sessionTokenConfigured).toBe(true);
  });

  it("readHeyGenEnvSnapshot uses VERCEL_URL when FSP_PUBLIC_BASE_URL is unset", () => {
    process.env.VERCEL_URL = "fsp-liveavatar-sle-prototype.vercel.app";
    process.env[HEYGEN_ENV.API_KEY] = "test-key";
    process.env[HEYGEN_ENV.LIVEAVATAR_AVATAR_ID] = "test-avatar";
    process.env[HEYGEN_ENV.LIVEAVATAR_CONTEXT_ID] = "test-context";
    process.env[HEYGEN_ENV.LIVEAVATAR_LLM_CONFIGURATION_ID] = "test-llm";

    const env = readHeyGenEnvSnapshot();

    expect(env.publicBaseUrl).toBe("https://fsp-liveavatar-sle-prototype.vercel.app");
    expect(env.publicBaseUrlSource).toBe("VERCEL_URL");
    expect(env.customLlmUrl).toBe(
      "https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions",
    );
    expect(env.sessionTokenConfigured).toBe(true);
  });

  it("readHeyGenEnvSnapshot accepts ExpoWall LIVEAVATAR_* aliases without exposing values", () => {
    process.env[EXPO_WALL_LIVEAVATAR_ENV.API_KEY] = "alias-key";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID] = "alias-avatar";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.CONTEXT_ID] = "alias-context";
    process.env[EXPO_WALL_LIVEAVATAR_ENV.LLM_CONFIGURATION_ID] = "alias-llm";
    process.env[HEYGEN_ENV.PUBLIC_BASE_URL] = "https://bridge.example.com";

    const env = readHeyGenEnvSnapshot();
    const serialized = JSON.stringify(env);

    expect(env.resolvedFrom.apiKey).toBe(EXPO_WALL_LIVEAVATAR_ENV.API_KEY);
    expect(env.resolvedFrom.avatarId).toBe(EXPO_WALL_LIVEAVATAR_ENV.AVATAR_ID);
    expect(env.configured).toBe(true);
    expect(serialized).not.toContain("alias-key");
    expect(serialized).not.toContain("alias-avatar");
    expect(env.expoWallAliasesPresent[EXPO_WALL_LIVEAVATAR_ENV.API_KEY]).toBe(
      true,
    );
  });

  it("getHeyGenIntegrationStatus reports Vercel bridge metadata and Supabase deferral", () => {
    process.env[HEYGEN_ENV.PUBLIC_BASE_URL] = "https://prod.example.com";

    const status = getHeyGenIntegrationStatus();

    expect(status.bridge.deployment_target).toBe("vercel");
    expect(status.bridge.custom_llm_url).toBe(
      "https://prod.example.com/v1/chat/completions",
    );
    expect(status.bridge.session_persistence).toBe("in_memory_deferred_supabase");
    expect(status.bridge.liveavatar_runtime).toBe("session_token_api");
    expect(status.connected).toBe(false);
  });
});

describe("secret safety in tracked source", () => {
  it("does not contain hardcoded secret-like assignment patterns", () => {
    const files = collectSourceFiles(REPO_ROOT).filter(
      (file) =>
        !file.includes(".env.local") &&
        !file.includes("/tests/") &&
        !file.endsWith("env-bridge-readiness.test.ts"),
    );

    const offenders: string[] = [];
    const patterns = [
      /HEYGEN_API_KEY\s*=\s*["'][^"']{8,}["']/,
      /LIVEAVATAR_API_KEY\s*=\s*["'][^"']{8,}["']/,
      /sk-[a-zA-Z0-9]{20,}/,
    ];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          offenders.push(file);
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it(".env.example is committable and contains placeholder names only", () => {
    const example = readFileSync(join(REPO_ROOT, ".env.example"), "utf8");

    expect(example).toContain("HEYGEN_API_KEY=");
    expect(example).toContain("FSP_PUBLIC_BASE_URL=");
    expect(example).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(example).not.toMatch(/HEYGEN_API_KEY=[^\s#]/);
  });
});
