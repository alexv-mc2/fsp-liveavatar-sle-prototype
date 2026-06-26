import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDiagnosticRun } from "@/lib/liveavatar/diagnosticClassification";
import type { DiagnosticRun } from "@/lib/liveavatar/diagnosticTypes";
import { logDiagnosticEvent } from "@/server/debug/diagnosticLogger";
import { sanitizeDiagnosticPayload } from "@/server/debug/diagnosticSanitize";
import {
  isDiagnosticApiEnabled,
  liveAvatarDiagnosticStore,
} from "@/server/debug/liveAvatarDiagnosticStore";
import { correlateCustomLlmToRuns } from "@/server/debug/diagnosticCorrelation";

function makeRun(events: DiagnosticRun["events"], ended = false): DiagnosticRun {
  return {
    runId: "abc12345",
    startedAt: new Date().toISOString(),
    endedAt: ended ? new Date().toISOString() : undefined,
    events,
  };
}

describe("sanitizeDiagnosticPayload", () => {
  it("redacts jwt-like strings and secret keys", () => {
    const sanitized = sanitizeDiagnosticPayload({
      session_token: "aaa.bbb.ccc",
      api_key: "super-secret",
      session_id_prefix: "11111111",
    });

    expect(sanitized?.session_token).toBe("[jwt:11]");
    expect(sanitized?.api_key).toBe("[redacted]");
    expect(sanitized?.session_id_prefix).toBe("11111111");
  });

  it("does not include raw user medical text beyond length", () => {
    const long = "A".repeat(200);
    const sanitized = sanitizeDiagnosticPayload({ note: long });
    expect(String(sanitized?.note)).toMatch(/…\(200\)/);
  });
});

describe("classifyDiagnosticRun", () => {
  it("detects TOKEN_FAIL", () => {
    const run = makeRun([{ ts: "t", phase: "session_token_failure" }], true);
    expect(classifyDiagnosticRun(run)).toBe("TOKEN_FAIL");
  });

  it("detects AVATAR_RESPONDED", () => {
    const run = makeRun(
      [
        { ts: "t1", phase: "sdk_start_success" },
        { ts: "t2", phase: "stream_ready" },
        { ts: "t3", phase: "ptt_start" },
        { ts: "t4", phase: "avatar_speak_started" },
      ],
      true,
    );
    expect(classifyDiagnosticRun(run)).toBe("AVATAR_RESPONDED");
  });

  it("detects NO_LLM_CALLBACK when user spoke and run ended", () => {
    const run = makeRun(
      [
        { ts: "t1", phase: "ptt_start" },
        { ts: "t2", phase: "ptt_stop" },
      ],
      true,
    );
    expect(classifyDiagnosticRun(run)).toBe("NO_LLM_CALLBACK");
  });
});

describe("diagnostic logger", () => {
  it("writes structured json to console", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logDiagnosticEvent({
      diagnostic_run_id: "abc12345",
      phase: "run_created",
      source: "server",
      payload: { session_token: "x.y.z" },
    });
    expect(spy).toHaveBeenCalledWith(
      "[fsp-diag]",
      expect.stringContaining('"diagnostic_run_id":"abc12345"'),
    );
    spy.mockRestore();
  });
});

describe("custom llm correlation", () => {
  it("matches fsp_session_id prefix first", () => {
    const runs: DiagnosticRun[] = [
      {
        runId: "run00001",
        startedAt: new Date().toISOString(),
        fspSessionIdPrefix: "11111111",
        events: [],
      },
      {
        runId: "run00002",
        startedAt: new Date().toISOString(),
        events: [],
      },
    ];

    const result = correlateCustomLlmToRuns(runs, {
      fsp_session_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.method).toBe("fsp_session_id");
    expect(result.runIds).toEqual(["run00001"]);
  });
});

describe("liveAvatarDiagnosticStore", () => {
  beforeEach(() => {
    liveAvatarDiagnosticStore.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates runs and appends sanitized events with structured logs", () => {
    const run = liveAvatarDiagnosticStore.createRun("abc12345", {
      interactivityType: "CONVERSATIONAL",
    });
    expect(run.runId).toBe("abc12345");

    liveAvatarDiagnosticStore.appendEvent("abc12345", "fsp_session_create_success", {
      session_id: "11111111-1111-4111-8111-111111111111",
    });

    const fetched = liveAvatarDiagnosticStore.getRun("abc12345");
    expect(fetched?.events.length).toBeGreaterThan(0);
    expect(fetched?.events.some((e) => e.phase === "fsp_session_create_success")).toBe(
      true,
    );
  });

  it("records custom LLM callbacks on active runs", () => {
    liveAvatarDiagnosticStore.createRun("run00001");
    const { matchedRunIds } = liveAvatarDiagnosticStore.recordCustomLlmCallback({
      request_id: "abcd1234",
      status: 200,
      has_assistant_content: true,
    });
    expect(matchedRunIds).toEqual(["run00001"]);
  });

  it("is enabled on preview and requires explicit opt-in on production", () => {
    const originalDiagnostics = process.env.FSP_LIVEAVATAR_DIAGNOSTICS;
    const originalVercel = process.env.VERCEL_ENV;

    delete process.env.FSP_LIVEAVATAR_DIAGNOSTICS;
    process.env.VERCEL_ENV = "preview";
    expect(isDiagnosticApiEnabled()).toBe(true);

    process.env.VERCEL_ENV = "production";
    expect(isDiagnosticApiEnabled()).toBe(false);

    process.env.FSP_LIVEAVATAR_DIAGNOSTICS = "1";
    expect(isDiagnosticApiEnabled()).toBe(true);

    process.env.FSP_LIVEAVATAR_DIAGNOSTICS = originalDiagnostics;
    process.env.VERCEL_ENV = originalVercel;
  });
});

describe("greeting diagnostic", () => {
  it("reports unsupported when repeat is missing", async () => {
    const { runGreetingDiagnostic } = await import("@/lib/liveavatar/greetingDiagnostic");
    const fakeSession = {} as import("@heygen/liveavatar-web-sdk").LiveAvatarSession;
    const result = runGreetingDiagnostic(fakeSession);
    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.phase).toBe("GREETING_UNSUPPORTED");
    }
  });
});
