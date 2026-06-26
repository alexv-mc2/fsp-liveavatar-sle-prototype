import { NextResponse } from "next/server";
import { createSession } from "@/server/routes/sessions";
import { toHttpError } from "@/server/routes/errorResponse";
import { extractDiagnosticRunId } from "@/server/debug/diagnosticLogger";
import {
  liveAvatarDiagnosticStore,
  registerFspSessionOnRun,
} from "@/server/debug/liveAvatarDiagnosticStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const diagnosticRunId = extractDiagnosticRunId(request);

  if (diagnosticRunId) {
    liveAvatarDiagnosticStore.appendEvent(
      diagnosticRunId,
      "fsp_session_create_start",
      undefined,
      "server",
      requestId,
    );
  }

  try {
    const session = createSession();

    if (diagnosticRunId) {
      registerFspSessionOnRun(diagnosticRunId, session.id);
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "fsp_session_create_success",
        {
          session_id_prefix: session.id.slice(0, 8),
          latency_ms: Date.now() - startedAt,
        },
        "server",
        requestId,
      );
    }

    return NextResponse.json(
      { session },
      { status: 201, headers: { "x-fsp-request-id": requestId } },
    );
  } catch (error) {
    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "fsp_session_create_failure",
        {
          message:
            error instanceof Error ? error.message.slice(0, 120) : "unknown",
        },
        "server",
        requestId,
      );
    }

    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, {
      status: httpError.status,
      headers: { "x-fsp-request-id": requestId },
    });
  }
}
