import type {
  DiagnosticBreakpoint,
  DiagnosticEvent,
  DiagnosticRun,
} from "@/lib/liveavatar/diagnosticTypes";
import { classifyDiagnosticRun } from "@/lib/liveavatar/diagnosticClassification";
import {
  correlateCustomLlmToRuns,
  type CustomLlmCorrelationMethod,
} from "./diagnosticCorrelation";
import { logDiagnosticEvent } from "./diagnosticLogger";
import { sanitizeDiagnosticPayload } from "./diagnosticSanitize";

const MAX_RUNS = 80;
const RUN_TTL_MS = 60 * 60 * 1000;

export type { DiagnosticEvent, DiagnosticRun, DiagnosticBreakpoint };

export class LiveAvatarDiagnosticStore {
  private readonly runs = new Map<string, DiagnosticRun>();

  createRun(
    runId: string,
    meta: {
      interactivityType?: string;
      fspSessionIdPrefix?: string;
      providerSessionIdPrefix?: string;
    } = {},
  ): DiagnosticRun {
    this.pruneExpired();
    const run: DiagnosticRun = {
      runId,
      startedAt: new Date().toISOString(),
      interactivityType: meta.interactivityType,
      fspSessionIdPrefix: meta.fspSessionIdPrefix,
      providerSessionIdPrefix: meta.providerSessionIdPrefix,
      events: [],
    };
    this.runs.set(runId, run);
    this.enforceCapacity();
    return run;
  }

  updateRunContext(
    runId: string,
    context: {
      fspSessionIdPrefix?: string;
      providerSessionIdPrefix?: string;
    },
  ): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    if (context.fspSessionIdPrefix) {
      run.fspSessionIdPrefix = context.fspSessionIdPrefix;
    }
    if (context.providerSessionIdPrefix) {
      run.providerSessionIdPrefix = context.providerSessionIdPrefix;
    }
    return run;
  }

  endRun(runId: string): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    run.endedAt = new Date().toISOString();
    run.classification = classifyDiagnosticRun(run);
    this.appendEvent(runId, "run_ended", undefined, "server");
    return run;
  }

  appendEvent(
    runId: string,
    phase: string,
    payload?: Record<string, unknown>,
    source: "client" | "server" = "client",
    requestId?: string,
  ): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }

    const event: DiagnosticEvent = {
      ts: new Date().toISOString(),
      phase,
      source,
      request_id: requestId,
      payload: payload ? sanitizeDiagnosticPayload(payload) : undefined,
    };
    run.events.push(event);
    run.classification = classifyDiagnosticRun(run);

    logDiagnosticEvent({
      diagnostic_run_id: runId,
      phase,
      source,
      request_id: requestId,
      payload,
    });

    return run;
  }

  getRun(runId: string): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    return {
      ...run,
      classification: run.classification ?? classifyDiagnosticRun(run),
    };
  }

  getActiveRuns(at = Date.now()): DiagnosticRun[] {
    return [...this.runs.values()].filter((run) => {
      if (run.endedAt) {
        return at - Date.parse(run.endedAt) < 30_000;
      }
      return at - Date.parse(run.startedAt) < RUN_TTL_MS;
    });
  }

  recordCustomLlmCallback(payload: Record<string, unknown>): {
    matchedRunIds: string[];
    correlationMethod: CustomLlmCorrelationMethod;
  } {
    const { runIds, method } = correlateCustomLlmToRuns(
      [...this.runs.values()],
      {
        fsp_session_id:
          typeof payload.fsp_session_id === "string"
            ? payload.fsp_session_id
            : undefined,
        provider_session_id:
          typeof payload.provider_session_id === "string"
            ? payload.provider_session_id
            : undefined,
      },
    );

    const enriched = {
      ...payload,
      correlation_method: method,
    };

    for (const runId of runIds) {
      this.appendEvent(
        runId,
        "custom_llm_callback",
        enriched,
        "server",
        typeof payload.request_id === "string" ? payload.request_id : undefined,
      );
    }

    if (runIds.length === 0) {
      logDiagnosticEvent({
        diagnostic_run_id: "uncorrelated",
        phase: "custom_llm_callback_uncorrelated",
        source: "server",
        request_id:
          typeof payload.request_id === "string" ? payload.request_id : undefined,
        payload: enriched,
      });
    }

    return { matchedRunIds: runIds, correlationMethod: method };
  }

  clear(): void {
    this.runs.clear();
  }

  private pruneExpired(): void {
    const cutoff = Date.now() - RUN_TTL_MS;
    for (const [id, run] of this.runs) {
      const last = Date.parse(run.endedAt ?? run.startedAt);
      if (last < cutoff) {
        this.runs.delete(id);
      }
    }
  }

  private enforceCapacity(): void {
    if (this.runs.size <= MAX_RUNS) {
      return;
    }
    const sorted = [...this.runs.entries()].sort(
      (a, b) => Date.parse(a[1].startedAt) - Date.parse(b[1].startedAt),
    );
    while (this.runs.size > MAX_RUNS) {
      const oldest = sorted.shift();
      if (oldest) {
        this.runs.delete(oldest[0]);
      }
    }
  }
}

const globalStore = globalThis as typeof globalThis & {
  __fspLiveAvatarDiagnosticStore?: LiveAvatarDiagnosticStore;
};

export const liveAvatarDiagnosticStore =
  globalStore.__fspLiveAvatarDiagnosticStore ??
  new LiveAvatarDiagnosticStore();

globalStore.__fspLiveAvatarDiagnosticStore = liveAvatarDiagnosticStore;

export function isDiagnosticApiEnabled(): boolean {
  if (process.env.FSP_LIVEAVATAR_DIAGNOSTICS === "0") {
    return false;
  }
  return true;
}

export function registerFspSessionOnRun(
  runId: string,
  fspSessionId: string,
): void {
  liveAvatarDiagnosticStore.updateRunContext(runId, {
    fspSessionIdPrefix: fspSessionId.slice(0, 8),
  });
}

export function registerProviderSessionOnRun(
  runId: string,
  providerSessionId: string,
): void {
  liveAvatarDiagnosticStore.updateRunContext(runId, {
    providerSessionIdPrefix: providerSessionId.slice(0, 8),
  });
}
