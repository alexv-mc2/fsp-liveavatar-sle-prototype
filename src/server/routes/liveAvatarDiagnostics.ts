import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyDiagnosticRun } from "@/lib/liveavatar/diagnosticClassification";
import { DIAGNOSTIC_CORRELATION_LIMITATIONS } from "../debug/diagnosticCorrelation";
import {
  isDiagnosticApiEnabled,
  liveAvatarDiagnosticStore,
} from "../debug/liveAvatarDiagnosticStore";
import { toHttpError } from "./errorResponse";

const RunIdSchema = z
  .string()
  .regex(/^[a-z0-9]{6,12}$/, "Invalid diagnostic_run_id format.");

const CreateRunSchema = z.object({
  run_id: RunIdSchema.optional(),
  interactivity_type: z.enum(["PUSH_TO_TALK", "CONVERSATIONAL"]).optional(),
  fsp_session_id_prefix: z.string().max(12).optional(),
});

const AppendEventSchema = z.object({
  run_id: RunIdSchema,
  phase: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(["client", "server"]).optional(),
  request_id: z.string().max(32).optional(),
});

function diagnosticDisabledResponse() {
  return NextResponse.json(
    {
      error: {
        code: "diagnostic_disabled",
        message: "Diagnostic API unavailable.",
      },
    },
    { status: 404 },
  );
}

function generateRunId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export function handleDiagnosticCreateRun(input: unknown) {
  if (!isDiagnosticApiEnabled()) {
    return diagnosticDisabledResponse();
  }

  const parsed = CreateRunSchema.parse(input);
  const runId = parsed.run_id ?? generateRunId();
  const run = liveAvatarDiagnosticStore.createRun(runId, {
    interactivityType: parsed.interactivity_type,
    fspSessionIdPrefix: parsed.fsp_session_id_prefix,
  });
  liveAvatarDiagnosticStore.appendEvent(runId, "run_created", {
    interactivity_type: parsed.interactivity_type,
  }, "server");

  return NextResponse.json({
    run_id: run.runId,
    started_at: run.startedAt,
    interactivity_type: run.interactivityType ?? null,
    persistence: {
      primary: "vercel_structured_logs",
      secondary: "in_memory_run_cache",
      log_query: `vercel logs --filter diagnostic_run_id=${run.runId}`,
    },
    correlation_limitations: DIAGNOSTIC_CORRELATION_LIMITATIONS,
  });
}

export function handleDiagnosticAppendEvent(input: unknown) {
  if (!isDiagnosticApiEnabled()) {
    return diagnosticDisabledResponse();
  }

  const parsed = AppendEventSchema.parse(input);
  const run = liveAvatarDiagnosticStore.appendEvent(
    parsed.run_id,
    parsed.phase,
    parsed.payload,
    "client",
    parsed.request_id,
  );

  if (!run) {
    return NextResponse.json(
      { error: { code: "run_not_found", message: "Diagnostic run not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    event_count: run.events.length,
    classification: classifyDiagnosticRun(run),
  });
}

export function handleDiagnosticEndRun(runId: string) {
  if (!isDiagnosticApiEnabled()) {
    return diagnosticDisabledResponse();
  }

  RunIdSchema.parse(runId);
  const run = liveAvatarDiagnosticStore.endRun(runId);
  if (!run) {
    return NextResponse.json(
      { error: { code: "run_not_found", message: "Diagnostic run not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    run_id: run.runId,
    started_at: run.startedAt,
    ended_at: run.endedAt,
    event_count: run.events.length,
    classification: run.classification,
  });
}

export function handleDiagnosticGetRun(runId: string) {
  if (!isDiagnosticApiEnabled()) {
    return diagnosticDisabledResponse();
  }

  RunIdSchema.parse(runId);
  const run = liveAvatarDiagnosticStore.getRun(runId);
  if (!run) {
    return NextResponse.json(
      { error: { code: "run_not_found", message: "Diagnostic run not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ...run,
    classification: run.classification ?? classifyDiagnosticRun(run),
    correlation_limitations: DIAGNOSTIC_CORRELATION_LIMITATIONS,
    persistence: {
      primary: "vercel_structured_logs",
      secondary: "in_memory_run_cache",
    },
  });
}

export async function handleDiagnosticPost(request: Request) {
  try {
    const body = await request.json();
    if (body?.action === "end" && typeof body.run_id === "string") {
      return handleDiagnosticEndRun(body.run_id);
    }
    if (typeof body?.phase === "string") {
      return handleDiagnosticAppendEvent(body);
    }
    return handleDiagnosticCreateRun(body);
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
