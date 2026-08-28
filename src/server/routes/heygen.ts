import { NextResponse } from "next/server";
import { toHttpError } from "./errorResponse";
import {
  extractDiagnosticRunId,
  logDiagnosticEvent,
} from "../debug/diagnosticLogger";
import { decodeSessionTokenClaimsSanitized } from "../debug/jwtClaimsSanitized";
import {
  liveAvatarDiagnosticStore,
  registerFspSessionOnRun,
  registerProviderSessionOnRun,
} from "../debug/liveAvatarDiagnosticStore";
import { sanitizeDiagnosticPayload } from "../debug/diagnosticSanitize";
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

    const recordTokenDiagnostic = (
      phase: string,
      payload: Record<string, unknown>,
    ) => {
      const enriched = {
        ...payload,
        request_id: requestId,
        diagnostic_run_id: diagnosticRunId ?? null,
      };
      const appended = diagnosticRunId
        ? liveAvatarDiagnosticStore.appendEvent(
            diagnosticRunId,
            phase,
            enriched,
            "server",
            requestId,
          )
        : undefined;
      if (!appended) {
        logDiagnosticEvent({
          diagnostic_run_id: diagnosticRunId ?? "unscoped",
          phase,
          source: "server",
          request_id: requestId,
          payload: enriched,
        });
      }
    };

    const payload = await createHeyGenSessionToken(rawBody, {
      onDiagnostics: (event) => {
        recordTokenDiagnostic(event.phase, event.payload);
      },
    });

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
          max_session_seconds: payload.max_session_seconds,
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
    const safeErrorPayload =
      error instanceof LiveAvatarApiError
        ? {
            message: error.message,
            code: error.code,
            provider_status: error.providerStatus ?? null,
            provider_code: error.providerCode ?? null,
            provider_message_prefix: error.providerMessagePrefix ?? null,
            max_session_seconds: error.requestMaxSessionSeconds ?? null,
          }
        : {
            message:
              error instanceof Error ? error.message.slice(0, 120) : "unknown",
          };

    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "session_token_failure",
        safeErrorPayload,
        "server",
        requestId,
      );
    } else {
      logDiagnosticEvent({
        diagnostic_run_id: "unscoped",
        phase: "session_token_failure",
        source: "server",
        request_id: requestId,
        payload: safeErrorPayload,
      });
    }

    if (error instanceof LiveAvatarApiError) {
      const debugPayload = diagnosticRunId
        ? sanitizeDiagnosticPayload({
            request_id: requestId,
            provider_status: error.providerStatus ?? null,
            provider_code: error.providerCode ?? null,
            provider_message_prefix: error.providerMessagePrefix ?? null,
            max_session_seconds: error.requestMaxSessionSeconds ?? null,
            reason: error.providerStatus
              ? `HeyGen rejected session-token request with status ${error.providerStatus} at max_session_seconds=${error.requestMaxSessionSeconds ?? "unknown"}.`
              : null,
          })
        : undefined;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(debugPayload ? { debug: debugPayload } : {}),
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
