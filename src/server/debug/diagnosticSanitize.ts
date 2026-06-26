const SECRET_KEY_PATTERN =
  /secret|token|api[_-]?key|authorization|password|bearer/i;

export function sanitizeDiagnosticPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string") {
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        out[key] = `[jwt:${value.length}]`;
        continue;
      }
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] =
        value.length > 120 ? `${value.slice(0, 8)}…(${value.length})` : value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.slice(0, 10).map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeDiagnosticPayload(item as Record<string, unknown>)
          : item,
      );
      continue;
    }

    if (typeof value === "object") {
      out[key] = sanitizeDiagnosticPayload(value as Record<string, unknown>);
    }
  }

  return out;
}

export function prefixUuid(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  return value.length >= 8 ? `${value.slice(0, 8)}…` : value;
}
