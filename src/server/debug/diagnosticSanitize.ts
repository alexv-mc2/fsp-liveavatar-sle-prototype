const SECRET_KEY_PATTERN =
  /secret|token|api[_-]?key|authorization|password|bearer/i;

function sanitizeStringValue(key: string, value: string): string {
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return `[jwt:${value.length}]`;
  }
  if (SECRET_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }
  return value.length > 120 ? `${value.slice(0, 8)}…(${value.length})` : value;
}

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
      out[key] = sanitizeStringValue(key, value);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.slice(0, 10).map((item) => {
        if (typeof item === "string") {
          return sanitizeStringValue(key, item);
        }
        if (typeof item === "object" && item !== null) {
          return sanitizeDiagnosticPayload(item as Record<string, unknown>);
        }
        return item;
      });
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
