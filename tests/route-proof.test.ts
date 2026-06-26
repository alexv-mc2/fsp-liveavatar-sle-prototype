import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCallbackRouteProof,
  buildRouteProofSnapshot,
  compareCallbackRoute,
  isGenericUnknownResponse,
} from "@/server/debug/routeProof";

describe("routeProof", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds deployment route proof from VERCEL_URL", () => {
    vi.stubEnv("VERCEL_URL", "preview-example.vercel.app");
    const snapshot = buildRouteProofSnapshot({
      llmConfigurationId: "880b199c-3930-4299-9d5e-e09cb03a0d86",
      llmConfigBaseUrl: "https://preview-example.vercel.app/v1",
      llmEnvSource: "HEYGEN_LIVEAVATAR_LLM_CONFIGURATION_ID",
    });

    expect(snapshot.deployment_host).toBe("preview-example.vercel.app");
    expect(snapshot.llm_configuration_id_prefix).toBe("880b199c…");
    expect(snapshot.llm_configuration_base_url_host).toBe("preview-example.vercel.app");
    expect(snapshot.llm_configuration_base_url_path).toBe("/v1");
    expect(snapshot.config_route_match).toBe(true);
  });

  it("marks route_match false when callback host differs", () => {
    vi.stubEnv("VERCEL_URL", "preview-example.vercel.app");
    const request = new Request(
      "https://fsp-liveavatar-sle-prototype.vercel.app/v1/chat/completions",
      { method: "POST" },
    );
    expect(compareCallbackRoute(request.url).route_match).toBe(false);
  });

  it("builds callback route proof with grounded preview", () => {
    vi.stubEnv("VERCEL_URL", "preview-example.vercel.app");
    const request = new Request(
      "https://preview-example.vercel.app/v1/chat/completions",
      { method: "POST" },
    );
    const proof = buildCallbackRouteProof({
      request,
      stream: true,
      latestUserTextLen: 34,
      httpStatus: 200,
      scenarioContextLoaded: true,
      promptSource: "repo_content",
      scenarioId: "fsp-nrw-sle",
      assistantContent:
        "Die Gelenkbeschwerden bestehen seit etwa sechs Wochen und sind langsam stärker geworden.",
    });

    expect(proof.custom_llm_callback_received).toBe(true);
    expect(proof.route_match).toBe(true);
    expect(proof.stream).toBe(true);
    expect(proof.latest_user_text_len).toBe(34);
    expect(proof.scenario_context_loaded).toBe(true);
    expect(proof.prompt_source).toBe("repo_content");
    expect(isGenericUnknownResponse(proof.grounded_response_preview)).toBe(false);
  });
});
