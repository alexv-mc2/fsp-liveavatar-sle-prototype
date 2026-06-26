import { z } from "zod";
import { FSP_SESSION_HEADER } from "@/integrations/heygen/contracts";
import { partitionCustomLlmMetadata } from "./metadata";

export type SessionIdSource =
  | "header"
  | "body_session_id"
  | "metadata_session_id"
  | "created";

export interface CustomLlmCorrelationResult {
  sessionId?: string;
  source: SessionIdSource;
  ignoredMetadataKeys: string[];
}

export class InvalidSessionIdError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Invalid session correlation in ${field}: expected a UUID.`);
    this.name = "InvalidSessionIdError";
    this.field = field;
  }
}

const UuidSchema = z.string().uuid();

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertValidUuid(value: string, field: string): void {
  if (!UuidSchema.safeParse(value).success) {
    throw new InvalidSessionIdError(field);
  }
}

export interface CustomLlmRequestCorrelationInput {
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export function resolveCustomLlmCorrelation(
  parsed: CustomLlmRequestCorrelationInput,
  headerSessionId?: string,
): CustomLlmCorrelationResult {
  const { allowed, ignoredKeys } = partitionCustomLlmMetadata(parsed.metadata);

  const header = normalizeSessionId(headerSessionId);
  if (header) {
    assertValidUuid(header, FSP_SESSION_HEADER);
    return {
      sessionId: header,
      source: "header",
      ignoredMetadataKeys: ignoredKeys,
    };
  }

  const bodySession = normalizeSessionId(parsed.session_id);
  if (bodySession) {
    assertValidUuid(bodySession, "session_id");
    return {
      sessionId: bodySession,
      source: "body_session_id",
      ignoredMetadataKeys: ignoredKeys,
    };
  }

  const metadataSession = normalizeSessionId(allowed.session_id);
  if (metadataSession) {
    assertValidUuid(metadataSession, "metadata.session_id");
    return {
      sessionId: metadataSession,
      source: "metadata_session_id",
      ignoredMetadataKeys: ignoredKeys,
    };
  }

  return {
    sessionId: undefined,
    source: "created",
    ignoredMetadataKeys: ignoredKeys,
  };
}
