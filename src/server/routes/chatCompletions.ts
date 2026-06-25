import { z } from "zod";
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
    session: SerializedSessionState;
  };
}

export class UnsupportedStreamingError extends Error {
  constructor() {
    super("Streaming is not implemented in the mock v0 endpoint.");
    this.name = "UnsupportedStreamingError";
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
    throw new Error("At least one user message is required.");
  }
  return contentToText(latest.content);
}

function approximateTokens(text: string): number {
  const normalized = text.trim();
  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
}

function resolveRequestedSessionId(
  parsed: z.infer<typeof OpenAIChatCompletionRequestSchema>,
  headerSessionId?: string,
): string | undefined {
  const metadataSessionId = parsed.metadata?.session_id;
  return (
    headerSessionId ??
    parsed.session_id ??
    (typeof metadataSessionId === "string" ? metadataSessionId : undefined)
  );
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
  const requestedSessionId = resolveRequestedSessionId(
    parsed,
    options.headerSessionId,
  );
  const session = requestedSessionId
    ? store.require(requestedSessionId)
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
      session: serialized,
    },
  };
}
