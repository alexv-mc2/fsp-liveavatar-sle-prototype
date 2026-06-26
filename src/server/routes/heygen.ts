import { NextResponse } from "next/server";
import { toHttpError } from "./errorResponse";
import { extractDiagnosticRunId } from "../debug/diagnosticLogger";
import { decodeSessionTokenClaimsSanitized } from "../debug/jwtClaimsSanitized";
import {
  liveAvatarDiagnosticStore,
  registerFspSessionOnRun,
  registerProviderSessionOnRun,
} from "../debug/liveAvatarDiagnosticStore";
import {
  createHeyGenSessionToken,
  enrichHeyGenStatusRouteProof,
  getHeyGenIntegrationStatus,
  LiveAvatarApiError,
} from "../integrations/heygen/sessionToken";

export async function getHeyGenStatusPayload() {
  return enrichHeyGenStatusRouteProof(getHeyGenIntegrationStatus());
}

export async function handleHeyGenSessionTokenPost(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  let diagnosticRunId: string | undefined;
  let rawBody: unknown;

  try {
    rawBody = await request.json();
    const bodyRecord =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};
    diagnosticRunId = extractDiagnosticRunId(request, bodyRecord);
    const fspSessionId =
      typeof bodyRecord.fsp_session_id === "string"
        ? bodyRecord.fsp_session_id
        : undefined;

    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "session_token_start",
        {
          fsp_session_id_prefix: fspSessionId?.slice(0, 8),
        },
        "server",
        requestId,
      );
      if (fspSessionId) {
        registerFspSessionOnRun(diagnosticRunId, fspSessionId);
      }
    }

    const payload = await createHeyGenSessionToken(rawBody);

    if (payload.status === "not_configured") {
      if (diagnosticRunId) {
        liveAvatarDiagnosticStore.appendEvent(
          diagnosticRunId,
          "session_token_failure",
          {
            http_status: 503,
            missing_env_count: payload.missing_env.length,
          },
          "server",
          requestId,
        );
        liveAvatarDiagnosticStore.appendEvent(
          diagnosticRunId,
          "session_token_result",
          { ok: false, http_status: 503 },
          "server",
          requestId,
        );
      }
      return NextResponse.json(payload, {
        status: 503,
        headers: { "x-fsp-request-id": requestId },
      });
    }

    const tokenClaims = decodeSessionTokenClaimsSanitized(payload.session_token);

    if (diagnosticRunId) {
      registerProviderSessionOnRun(
        diagnosticRunId,
        payload.provider_session_id,
      );
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "session_token_success",
        {
          interactivity_type: payload.interactivity_type,
          provider_session_id_prefix: payload.provider_session_id.slice(0, 8),
          latency_ms: Date.now() - startedAt,
        },
        "server",
        requestId,
      );
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "token_claims_sanitized",
        {
          ...(tokenClaims ?? { decode_error: true }),
          route_proof: payload.route_proof,
        },
        "server",
        requestId,
      );
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "session_token_result",
        { ok: true, http_status: 200, latency_ms: Date.now() - startedAt },
        "server",
        requestId,
      );
    }

    return NextResponse.json(payload, {
      headers: { "x-fsp-request-id": requestId },
    });
  } catch (error) {
    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "session_token_failure",
        {
          message:
            error instanceof Error ? error.message.slice(0, 120) : "unknown",
        },
        "server",
        requestId,
      );
    }

    if (error instanceof LiveAvatarApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status, headers: { "x-fsp-request-id": requestId } },
      );
    }

    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, {
      status: httpError.status,
      headers: { "x-fsp-request-id": requestId },
    });
  }
}
