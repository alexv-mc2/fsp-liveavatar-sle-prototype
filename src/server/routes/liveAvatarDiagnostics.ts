import { NextResponse } from "next/server";
import { z } from "zod";
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
});

const AppendEventSchema = z.object({
  run_id: RunIdSchema,
  phase: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).optional(),
});

function diagnosticDisabledResponse() {
  return NextResponse.json(
    { error: { code: "diagnostic_disabled", message: "Diagnostic API unavailable." } },
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
  });
  liveAvatarDiagnosticStore.appendEvent(runId, "run_started", {
    interactivity_type: parsed.interactivity_type,
  });

  return NextResponse.json({
    run_id: run.runId,
    started_at: run.startedAt,
    interactivity_type: run.interactivityType ?? null,
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
  );

  if (!run) {
    return NextResponse.json(
      { error: { code: "run_not_found", message: "Diagnostic run not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, event_count: run.events.length });
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

  return NextResponse.json(run);
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
