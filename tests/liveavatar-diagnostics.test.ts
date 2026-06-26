import { beforeEach, describe, expect, it } from "vitest";
import {
  isDiagnosticApiEnabled,
  liveAvatarDiagnosticStore,
} from "@/server/debug/liveAvatarDiagnosticStore";

describe("liveAvatarDiagnosticStore", () => {
  beforeEach(() => {
    liveAvatarDiagnosticStore.clear();
  });

  it("creates runs and appends sanitized events", () => {
    const run = liveAvatarDiagnosticStore.createRun("abc12345", {
      interactivityType: "CONVERSATIONAL",
    });
    expect(run.runId).toBe("abc12345");

    liveAvatarDiagnosticStore.appendEvent("abc12345", "connect_start", {
      session_id: "11111111-1111-4111-8111-111111111111",
    });

    const fetched = liveAvatarDiagnosticStore.getRun("abc12345");
    expect(fetched?.events).toHaveLength(1);
    expect(fetched?.events[0]?.phase).toBe("connect_start");
    expect(fetched?.events[0]?.payload?.session_id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("records custom LLM callbacks on active runs", () => {
    liveAvatarDiagnosticStore.createRun("run00001");
    const matched = liveAvatarDiagnosticStore.recordCustomLlmCallback({
      request_id: "abcd1234",
      status: 200,
    });
    expect(matched).toEqual(["run00001"]);
    const run = liveAvatarDiagnosticStore.getRun("run00001");
    expect(run?.events.some((e) => e.phase === "custom_llm_callback")).toBe(true);
  });

  it("reports preview diagnostic API as enabled on preview env", () => {
    const original = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    expect(isDiagnosticApiEnabled()).toBe(true);
    process.env.VERCEL_ENV = original;
  });
});
