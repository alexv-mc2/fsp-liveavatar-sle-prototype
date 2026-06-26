import { sanitizeDiagnosticPayload } from "./diagnosticSanitize";

export type DiagnosticLogEvent = {
  diagnostic_run_id: string;
  phase: string;
  source: "client" | "server";
  request_id?: string;
  payload?: Record<string, unknown>;
};

export function logDiagnosticEvent(event: DiagnosticLogEvent): void {
  const record = {
    ts: new Date().toISOString(),
    diagnostic_run_id: event.diagnostic_run_id,
    request_id: event.request_id,
    phase: event.phase,
    source: event.source,
    payload: sanitizeDiagnosticPayload(event.payload),
  };

  console.info("[fsp-diag]", JSON.stringify(record));
}

export function extractDiagnosticRunId(
  request: Request,
  body?: Record<string, unknown>,
): string | undefined {
  const header = request.headers.get("x-fsp-diagnostic-run-id")?.trim();
  if (header) {
    return header;
  }

  const fromBody = body?.diagnostic_run_id;
  return typeof fromBody === "string" && fromBody.trim().length > 0
    ? fromBody.trim()
    : undefined;
}
