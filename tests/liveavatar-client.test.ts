import { describe, expect, it, vi } from "vitest";
import {
  fetchHeyGenBridgeStatus,
  isBridgeReady,
  parseSessionTokenResponse,
  requestHeyGenSessionToken,
} from "@/lib/liveavatar/clientApi";
import type { HeyGenBridgeStatus } from "@/lib/liveavatar/types";

describe("liveavatar clientApi", () => {
  describe("isBridgeReady", () => {
    it("returns true when session token bridge is configured", () => {
      const status: HeyGenBridgeStatus = {
        connected: true,
        session_token_configured: true,
        mode: "FULL",
        push_to_talk: "browser_sdk",
        env: {
          sessionTokenConfigured: true,
          runtimeDefaults: { INTERACTIVITY_TYPE: "PUSH_TO_TALK" },
        },
      };

      expect(isBridgeReady(status)).toBe(true);
    });

    it("returns false when session token is not configured", () => {
      const status: HeyGenBridgeStatus = {
        connected: false,
        session_token_configured: false,
        mode: "FULL",
        push_to_talk: "browser_sdk",
        env: {
          sessionTokenConfigured: false,
          runtimeDefaults: { INTERACTIVITY_TYPE: "PUSH_TO_TALK" },
        },
      };

      expect(isBridgeReady(status)).toBe(false);
    });
  });

  describe("parseSessionTokenResponse", () => {
    it("accepts a successful token payload", () => {
      const parsed = parseSessionTokenResponse(200, {
        status: "ok",
        session_token: "tok_abc",
        provider_session_id: "prov_123",
        fsp_session_id: "11111111-1111-4111-8111-111111111111",
      });

      expect(parsed).toEqual({
        ok: true,
        data: {
          status: "ok",
          session_token: "tok_abc",
          provider_session_id: "prov_123",
          fsp_session_id: "11111111-1111-4111-8111-111111111111",
        },
      });
    });

    it("maps 503 not_configured responses", () => {
      const parsed = parseSessionTokenResponse(503, {
        status: "not_configured",
        missing_env: ["HEYGEN_API_KEY"],
        message: "missing env",
      });

      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.kind).toBe("not_configured");
      }
    });

    it("maps API error bodies", () => {
      const parsed = parseSessionTokenResponse(502, {
        error: { code: "liveavatar_upstream", message: "upstream failed" },
      });

      expect(parsed).toEqual({
        ok: false,
        kind: "error",
        status: 502,
        message: "upstream failed",
      });
    });
  });

  describe("requestHeyGenSessionToken", () => {
    it("POSTs fsp_session_id without exposing secrets", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          status: "ok",
          session_token: "session-token-value",
          provider_session_id: "provider-id",
          fsp_session_id: "22222222-2222-4222-8222-222222222222",
        }),
      });

      const result = await requestHeyGenSessionToken(
        "22222222-2222-4222-8222-222222222222",
        fetchMock,
      );

      expect(result.session_token).toBe("session-token-value");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/heygen/session-token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            fsp_session_id: "22222222-2222-4222-8222-222222222222",
          }),
        }),
      );

      const requestBody = JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
      );
      expect(requestBody).not.toHaveProperty("HEYGEN_API_KEY");
      expect(requestBody).not.toHaveProperty("api_key");
    });
  });

  describe("fetchHeyGenBridgeStatus", () => {
    it("loads bridge status from the public status route", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          connected: true,
          session_token_configured: true,
          mode: "FULL",
          push_to_talk: "browser_sdk",
        }),
      });

      const status = await fetchHeyGenBridgeStatus(fetchMock);
      expect(status.connected).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/heygen/status",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });
});
