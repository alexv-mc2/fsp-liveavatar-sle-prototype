import type { DiagnosticRun } from "@/lib/liveavatar/diagnosticTypes";

export type CustomLlmCorrelationMethod =
  | "fsp_session_id"
  | "provider_session_id"
  | "active_window"
  | "none";

export function correlateCustomLlmToRuns(
  runs: DiagnosticRun[],
  payload: {
    fsp_session_id?: string;
    fsp_session_id_prefix?: string;
    provider_session_id?: string;
    provider_session_id_prefix?: string;
  },
  at = Date.now(),
): { runIds: string[]; method: CustomLlmCorrelationMethod } {
  const active = runs.filter((run) => {
    if (run.endedAt) {
      return at - Date.parse(run.endedAt) < 30_000;
    }
    return at - Date.parse(run.startedAt) < 60 * 60 * 1000;
  });

  if (payload.fsp_session_id) {
    const sessionPrefix = payload.fsp_session_id.slice(0, 8);
    const matched = active.filter((run) => run.fspSessionIdPrefix === sessionPrefix);
    if (matched.length > 0) {
      return { runIds: matched.map((run) => run.runId), method: "fsp_session_id" };
    }
  }

  if (payload.provider_session_id) {
    const providerPrefix = payload.provider_session_id.slice(0, 8);
    const matched = active.filter(
      (run) => run.providerSessionIdPrefix === providerPrefix,
    );
    if (matched.length > 0) {
      return {
        runIds: matched.map((run) => run.runId),
        method: "provider_session_id",
      };
    }
  }

  const windowMatched = active.filter((run) => !run.endedAt);
  if (windowMatched.length > 0) {
    return {
      runIds: windowMatched.map((run) => run.runId),
      method: "active_window",
    };
  }

  return { runIds: [], method: "none" };
}

export const DIAGNOSTIC_CORRELATION_LIMITATIONS = [
  "HeyGen Custom LLM requests cannot include diagnostic_run_id.",
  "Correlation uses fsp_session_id when HeyGen sends session_id/header, else provider_session_id from token mint, else all active diagnostic runs in a 60-minute window.",
  "Cross-serverless-instance GET /api/debug/liveavatar/runs/{id} may 404; durable source of truth is Vercel structured logs filtered by diagnostic_run_id.",
  "Custom LLM callbacks without session_id only correlate via active_window and may attach to multiple concurrent debug runs.",
] as const;
