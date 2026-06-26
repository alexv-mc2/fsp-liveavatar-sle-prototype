import { z } from "zod";

/** Short German patient filler for HeyGen VAD/listening callbacks with no transcript. */
export const HEYGEN_VAD_NOOP_RESPONSE_DE =
  "Entschuldigung, ich habe Sie gerade nicht ganz verstanden.";

const MessageContentPartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    input_text: z.string().optional(),
  })
  .passthrough();

export const ChatMessageSchema = z
  .object({
    role: z.preprocess(
      (value) => (typeof value === "string" ? value.toLowerCase() : value),
      z.enum(["system", "developer", "user", "assistant", "tool"]),
    ),
    content: z
      .union([z.string(), z.array(MessageContentPartSchema), z.null()])
      .optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const OpenAIChatCompletionRequestSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(ChatMessageSchema).min(1),
    stream: z.boolean().optional().default(false),
    user: z.string().optional(),
    session_id: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type ParsedChatMessage = z.infer<typeof ChatMessageSchema>;

export type UserMessageResolution =
  | { kind: "text"; text: string; index: number }
  | { kind: "empty"; reason: "missing_user" | "empty_content" };

export type CustomLlmRequestShapeSummary = {
  message_count: number;
  roles: string[];
  latest_user_index: number | null;
  latest_user_content_kind:
    | "string"
    | "array"
    | "null"
    | "undefined"
    | "missing_user";
  latest_user_text_len: number;
  stream: boolean;
  has_session_id: boolean;
  has_metadata: boolean;
  metadata_keys: string[];
  top_level_keys: string[];
};

function safePartToText(part: unknown): string {
  if (typeof part !== "object" || part === null) {
    return "";
  }
  const record = part as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.input_text === "string") {
    return record.input_text;
  }
  return "";
}

export function messageContentToText(
  content: ParsedChatMessage["content"],
): string {
  return safeMessageContentToText(content);
}

function safeMessageContentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map(safePartToText).join("\n");
}

function normalizeRole(role: unknown): ParsedChatMessage["role"] | null {
  if (typeof role !== "string") {
    return null;
  }
  const normalized = role.toLowerCase();
  if (
    normalized === "system" ||
    normalized === "developer" ||
    normalized === "user" ||
    normalized === "assistant" ||
    normalized === "tool"
  ) {
    return normalized;
  }
  return null;
}

export function resolveLatestUserMessage(
  messages: ParsedChatMessage[],
): UserMessageResolution {
  let sawUserRole = false;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (normalizeRole(message.role) !== "user") {
      continue;
    }

    sawUserRole = true;
    const text = messageContentToText(message.content).trim();
    if (text) {
      return { kind: "text", text, index };
    }
  }

  if (sawUserRole) {
    return { kind: "empty", reason: "empty_content" };
  }

  return { kind: "empty", reason: "missing_user" };
}

function contentKind(
  content: ParsedChatMessage["content"],
): CustomLlmRequestShapeSummary["latest_user_content_kind"] {
  if (content === undefined) {
    return "undefined";
  }
  if (content === null) {
    return "null";
  }
  if (typeof content === "string") {
    return "string";
  }
  return "array";
}

export function describeCustomLlmRequestShape(
  body: unknown,
): CustomLlmRequestShapeSummary {
  const fallback: CustomLlmRequestShapeSummary = {
    message_count: 0,
    roles: [],
    latest_user_index: null,
    latest_user_content_kind: "missing_user",
    latest_user_text_len: 0,
    stream: false,
    has_session_id: false,
    has_metadata: false,
    metadata_keys: [],
    top_level_keys: [],
  };

  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const record = body as Record<string, unknown>;
  const rawMessages = Array.isArray(record.messages) ? record.messages : [];

  let latestUserIndex: number | null = null;
  let latestUserContent: unknown;
  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const message = rawMessages[index];
    if (typeof message !== "object" || message === null) {
      continue;
    }
    if (normalizeRole((message as { role?: unknown }).role) === "user") {
      latestUserIndex = index;
      latestUserContent = (message as { content?: unknown }).content;
      break;
    }
  }

  const metadata =
    typeof record.metadata === "object" && record.metadata !== null
      ? (record.metadata as Record<string, unknown>)
      : null;

  return {
    message_count: rawMessages.length,
    roles: rawMessages.slice(0, 12).map((message) => {
      if (typeof message === "object" && message !== null && "role" in message) {
        return String((message as { role?: unknown }).role ?? "?");
      }
      return "?";
    }),
    latest_user_index: latestUserIndex,
    latest_user_content_kind:
      latestUserIndex === null
        ? "missing_user"
        : contentKind(latestUserContent as ParsedChatMessage["content"]),
    latest_user_text_len:
      latestUserIndex === null
        ? 0
        : safeMessageContentToText(latestUserContent).trim().length,
    stream: record.stream === true,
    has_session_id: typeof record.session_id === "string",
    has_metadata: metadata !== null,
    metadata_keys: metadata ? Object.keys(metadata).slice(0, 12) : [],
    top_level_keys: Object.keys(record).slice(0, 20),
  };
}
