export type DiagnosticEvent = {
  ts: string;
  phase: string;
  payload?: Record<string, unknown>;
};

export type DiagnosticRun = {
  runId: string;
  startedAt: string;
  endedAt?: string;
  interactivityType?: string;
  events: DiagnosticEvent[];
};

const MAX_RUNS = 40;
const RUN_TTL_MS = 60 * 60 * 1000;

export class LiveAvatarDiagnosticStore {
  private readonly runs = new Map<string, DiagnosticRun>();

  createRun(
    runId: string,
    meta: { interactivityType?: string } = {},
  ): DiagnosticRun {
    this.pruneExpired();
    const run: DiagnosticRun = {
      runId,
      startedAt: new Date().toISOString(),
      interactivityType: meta.interactivityType,
      events: [],
    };
    this.runs.set(runId, run);
    this.enforceCapacity();
    return run;
  }

  endRun(runId: string): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    run.endedAt = new Date().toISOString();
    this.appendEvent(runId, "run_ended");
    return run;
  }

  appendEvent(
    runId: string,
    phase: string,
    payload?: Record<string, unknown>,
  ): DiagnosticRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    run.events.push({
      ts: new Date().toISOString(),
      phase,
      payload: payload ? sanitizePayload(payload) : undefined,
    });
    return run;
  }

  getRun(runId: string): DiagnosticRun | undefined {
    return this.runs.get(runId);
  }

  getActiveRuns(at = Date.now()): DiagnosticRun[] {
    return [...this.runs.values()].filter((run) => {
      if (run.endedAt) {
        const ended = Date.parse(run.endedAt);
        return at - ended < 30_000;
      }
      return at - Date.parse(run.startedAt) < RUN_TTL_MS;
    });
  }

  recordCustomLlmCallback(payload: Record<string, unknown>): string[] {
    const active = this.getActiveRuns();
    const matched: string[] = [];
    for (const run of active) {
      this.appendEvent(run.runId, "custom_llm_callback", payload);
      matched.push(run.runId);
    }
    return matched;
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

function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string") {
      out[key] =
        value.length > 120 ? `${value.slice(0, 8)}…(${value.length})` : value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 10);
      continue;
    }
    if (typeof value === "object") {
      out[key] = sanitizePayload(value as Record<string, unknown>);
    }
  }
  return out;
}

const globalStore = globalThis as typeof globalThis & {
  __fspLiveAvatarDiagnosticStore?: LiveAvatarDiagnosticStore;
};

export const liveAvatarDiagnosticStore =
  globalStore.__fspLiveAvatarDiagnosticStore ??
  new LiveAvatarDiagnosticStore();

globalStore.__fspLiveAvatarDiagnosticStore = liveAvatarDiagnosticStore;

export function isDiagnosticApiEnabled(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development"
  );
}
