import { NextResponse } from "next/server";
import { z } from "zod";
import { liveAvatarDiagnosticStore } from "../debug/liveAvatarDiagnosticStore";
import { toHttpError } from "./errorResponse";
import { evaluateGuardrails } from "../fsp/guardrails";
import { resolveHiddenFacts } from "../fsp/hiddenFactPolicy";
import {
  isPatientConversationPhase,
  transitionPhase,
} from "../fsp/phaseMachine";
import { validatePatientResponse } from "../fsp/responseValidator";
import { loadScenario } from "../fsp/scenarioLoader";
import {
  InMemorySessionStore,
  sessionStore,
} from "../fsp/scenarioState";
import type { SerializedSessionState, SleScenario } from "../fsp/types";
import {
  EmptyUserMessageError,
  resolveCustomLlmCorrelation,
  type SessionIdSource,
} from "../integrations/customLlm/correlation";

const MessageContentPartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

const ChatMessageSchema = z
  .object({
    role: z.enum(["system", "developer", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(MessageContentPartSchema)]),
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

export type OpenAIChatCompletionRequest = z.input<
  typeof OpenAIChatCompletionRequestSchema
>;

export interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  x_fsp: {
    mock: true;
    session_id: string;
    phase: SerializedSessionState["phase"];
    revealed_fact_ids: string[];
    blocked_fact_ids: string[];
    safety_flag?: string;
    correlation: {
      session_id_source: SessionIdSource;
      ignored_metadata_keys: string[];
    };
    session: SerializedSessionState;
  };
}

export class UnsupportedStreamingError extends Error {
  constructor() {
    super("Streaming is not implemented in the mock v0 endpoint.");
    this.name = "UnsupportedStreamingError";
  }
}

export class MissingUserMessageError extends Error {
  constructor() {
    super("At least one user message is required.");
    this.name = "MissingUserMessageError";
  }
}

function contentToText(content: z.infer<typeof ChatMessageSchema>["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function latestUserMessage(
  messages: z.infer<typeof ChatMessageSchema>[],
): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  if (!latest) {
    throw new MissingUserMessageError();
  }
  const text = contentToText(latest.content).trim();
  if (!text) {
    throw new EmptyUserMessageError();
  }
  return text;
}

function approximateTokens(text: string): number {
  const normalized = text.trim();
  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
}

function respondToPatientQuestionPhase(
  scenario: SleScenario,
  session: ReturnType<InMemorySessionStore["require"]>,
): string {
  const nextQuestion = scenario.patient_questions[session.patientQuestionIndex];
  if (nextQuestion) {
    session.patientQuestionIndex += 1;
    session.updatedAt = new Date().toISOString();
    return nextQuestion;
  }
  return "Danke. Dann warte ich auf die weiteren Untersuchungen.";
}

export function processChatCompletion(
  input: unknown,
  options: {
    headerSessionId?: string;
    store?: InMemorySessionStore;
    scenario?: SleScenario;
  } = {},
): OpenAIChatCompletionResponse {
  const parsed = OpenAIChatCompletionRequestSchema.parse(input);
  if (parsed.stream) {
    throw new UnsupportedStreamingError();
  }

  const store = options.store ?? sessionStore;
  const scenario = options.scenario ?? loadScenario();
  const correlation = resolveCustomLlmCorrelation(parsed, options.headerSessionId);
  const session = correlation.sessionId
    ? store.require(correlation.sessionId)
    : store.create(scenario);
  const userText = latestUserMessage(parsed.messages);

  if (session.phase === "patient_opening") {
    transitionPhase(session, "anamnesis_active", scenario, store);
  }

  store.appendTurn(session, "user", userText, "text_mock");

  const guardrail = evaluateGuardrails(userText);
  let responseDe: string;
  let blockedFactIds: string[] = [];
  let safetyFlag: string | undefined;

  if (guardrail.blocked) {
    responseDe = guardrail.responseDe ?? scenario.fallbacks.unknown_de;
    safetyFlag = guardrail.kind;
    if (guardrail.kind) {
      session.safetyFlags.push(guardrail.kind);
    }
  } else if (!isPatientConversationPhase(session.phase)) {
    responseDe = scenario.fallbacks.non_patient_phase_de;
  } else if (session.phase === "patient_questions") {
    responseDe = respondToPatientQuestionPhase(scenario, session);
  } else {
    const resolution = resolveHiddenFacts(userText, session, scenario);
    responseDe = resolution.responseDe;
    blockedFactIds = resolution.blockedFactIds;
  }

  if (!guardrail.blocked) {
    const validation = validatePatientResponse(
      responseDe,
      session.phase,
      scenario,
    );
    responseDe = validation.responseDe;
    if (validation.replaced && validation.reason) {
      session.safetyFlags.push(validation.reason);
      safetyFlag ??= validation.reason;
    }
  }

  store.appendTurn(
    session,
    "assistant",
    responseDe,
    guardrail.blocked ? "guardrail" : "text_mock",
  );

  const promptText = parsed.messages
    .map((message) => contentToText(message.content))
    .join("\n");
  const promptTokens = approximateTokens(promptText);
  const completionTokens = approximateTokens(responseDe);
  const serialized = store.serialize(session);

  return {
    id: `chatcmpl-fsp-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: parsed.model ?? "fsp-sle-deterministic-mock-v0",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: responseDe },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    x_fsp: {
      mock: true,
      session_id: session.id,
      phase: session.phase,
      revealed_fact_ids: [...session.revealedFactIds],
      blocked_fact_ids: blockedFactIds,
      safety_flag: safetyFlag,
      correlation: {
        session_id_source: correlation.source,
        ignored_metadata_keys: correlation.ignoredMetadataKeys,
      },
      session: serialized,
    },
  };
}

export async function handleChatCompletionPost(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const receivedAt = new Date().toISOString();

  try {
    const body = await request.json();
    const headerSessionId = request.headers.get("x-fsp-session-id") ?? undefined;
    const result = processChatCompletion(body, { headerSessionId });

    const userPreview =
      typeof body === "object" &&
      body !== null &&
      Array.isArray((body as { messages?: unknown[] }).messages)
        ? contentToText(
            [...(body as { messages: z.infer<typeof ChatMessageSchema>[] }).messages]
              .reverse()
              .find((message) => message.role === "user")?.content ?? "",
          ).slice(0, 80)
        : "";

    const logPayload = {
      request_id: requestId,
      received_at: receivedAt,
      status: 200,
      correlation: result.x_fsp.correlation.session_id_source,
      session_id_prefix: result.x_fsp.session_id.slice(0, 8),
      message_count: Array.isArray((body as { messages?: unknown[] }).messages)
        ? (body as { messages: unknown[] }).messages.length
        : 0,
      user_preview_len: userPreview.length,
      has_assistant_content: Boolean(result.choices[0]?.message.content),
      active_diagnostic_runs: liveAvatarDiagnosticStore
        .getActiveRuns()
        .map((run) => run.runId),
    };

    console.info("[custom-llm]", logPayload);

    liveAvatarDiagnosticStore.recordCustomLlmCallback({
      request_id: requestId,
      received_at: receivedAt,
      status: 200,
      correlation: result.x_fsp.correlation.session_id_source,
      message_count: logPayload.message_count,
      user_preview_len: logPayload.user_preview_len,
      has_assistant_content: logPayload.has_assistant_content,
    });

    return NextResponse.json(result, {
      headers: {
        "x-fsp-session-id": result.x_fsp.session_id,
        "x-fsp-request-id": requestId,
      },
    });
  } catch (error) {
    const httpError = toHttpError(error);
    console.info("[custom-llm]", {
      request_id: requestId,
      received_at: receivedAt,
      status: httpError.status,
      error_code:
        typeof httpError.body === "object" &&
        httpError.body !== null &&
        "error" in httpError.body &&
        typeof (httpError.body as { error?: { code?: string } }).error?.code ===
          "string"
          ? (httpError.body as { error: { code: string } }).error.code
          : "unknown",
    });
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
