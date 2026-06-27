import { NextResponse } from "next/server";
import { z } from "zod";
import { liveAvatarDiagnosticStore } from "../debug/liveAvatarDiagnosticStore";
import { sanitizeUserTextPrefix } from "../debug/diagnosticSanitize";
import {
  buildCallbackRouteProof,
} from "../debug/routeProof";
import { toHttpError } from "./errorResponse";
import { evaluateGuardrails } from "../fsp/guardrails";
import { findLastAssistantResponse } from "../fsp/patientBehavior/conversationHistory";
import { normalizePatientText } from "../fsp/patientBehavior/normalize";
import { resolveHiddenFacts } from "../fsp/hiddenFactPolicy";
import { buildAuthoritativePatientContext } from "../fsp/promptBuilder";
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
  describeCustomLlmRequestShape,
  HEYGEN_VAD_NOOP_RESPONSE_DE,
  OpenAIChatCompletionRequestSchema,
  resolveLatestUserMessage,
  type ParsedChatMessage,
} from "../integrations/customLlm/messageExtraction";
import {
  resolveCustomLlmCorrelation,
  type SessionIdSource,
} from "../integrations/customLlm/correlation";
import {
  encodeOpenAiStreamingBody,
  OPENAI_STREAMING_HEADERS,
} from "../integrations/customLlm/streamingResponse";

export { OpenAIChatCompletionRequestSchema } from "../integrations/customLlm/messageExtraction";

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
    vad_noop?: boolean;
    vad_noop_reason?: "missing_user" | "empty_content";
    session_persisted?: boolean;
    correlation: {
      session_id_source: SessionIdSource;
      ignored_metadata_keys: string[];
    };
    grounding: {
      scenario_context_loaded: boolean;
      scenario_id: string;
      prompt_source: "repo_content";
      correlation_method: SessionIdSource;
      ignored_incoming_system_messages: number;
    };
    session: SerializedSessionState;
    patient_behavior?: {
      response_class: string;
      intent: string | null;
      question_quality: string[];
      matched_fact_id?: string | null;
      matched_alias_id?: string | null;
      fallback_reason?: string | null;
    };
  };
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

function buildGroundingMetadata(
  scenario: SleScenario,
  messages: ParsedChatMessage[],
  correlationSource: SessionIdSource,
) {
  const context = buildAuthoritativePatientContext(scenario, messages);
  return {
    scenario_context_loaded: context.scenarioContextLoaded,
    scenario_id: context.scenarioId,
    prompt_source: context.promptSource,
    correlation_method: correlationSource,
    ignored_incoming_system_messages: context.ignoredIncomingSystemMessages,
  };
}

function buildVadNoopResponse(
  parsed: z.infer<typeof OpenAIChatCompletionRequestSchema>,
  correlation: ReturnType<typeof resolveCustomLlmCorrelation>,
  reason: "missing_user" | "empty_content",
  options: {
    store?: InMemorySessionStore;
    scenario?: SleScenario;
  },
): OpenAIChatCompletionResponse {
  const store = options.store ?? sessionStore;
  const scenario = options.scenario ?? loadScenario();
  const filler = HEYGEN_VAD_NOOP_RESPONSE_DE;

  const existingSession = correlation.sessionId
    ? store.get(correlation.sessionId)
    : undefined;
  const sessionId = existingSession?.id ?? correlation.sessionId ?? "";
  const sessionPersisted = existingSession !== undefined;
  const serialized =
    existingSession !== undefined
      ? store.serialize(existingSession)
      : ({
          id: sessionId,
          caseId: scenario.metadata.id,
          phase: "patient_opening",
          revealedFactIds: [],
          askedChecklistItems: [],
          transcriptTurns: [],
          factRevealEvents: [],
          safetyFlags: [],
          patientQuestionIndex: 0,
          lastPatientResponseDe: null,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies SerializedSessionState);

  const completionTokens = approximateTokens(filler);
  const grounding = buildGroundingMetadata(
    scenario,
    parsed.messages,
    correlation.source,
  );

  return {
    id: `chatcmpl-fsp-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: parsed.model ?? "fsp-sle-deterministic-mock-v0",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: filler },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: completionTokens,
      total_tokens: completionTokens,
    },
    x_fsp: {
      mock: true,
      session_id: sessionId,
      phase: serialized.phase,
      revealed_fact_ids: [...serialized.revealedFactIds],
      blocked_fact_ids: [],
      vad_noop: true,
      vad_noop_reason: reason,
      session_persisted: sessionPersisted,
      correlation: {
        session_id_source: correlation.source,
        ignored_metadata_keys: correlation.ignoredMetadataKeys,
      },
      grounding,
      session: serialized,
    },
  };
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

  const store = options.store ?? sessionStore;
  const scenario = options.scenario ?? loadScenario();
  const correlation = resolveCustomLlmCorrelation(parsed, options.headerSessionId);
  const userResolution = resolveLatestUserMessage(parsed.messages);
  const grounding = buildGroundingMetadata(
    scenario,
    parsed.messages,
    correlation.source,
  );

  if (userResolution.kind === "empty") {
    return buildVadNoopResponse(parsed, correlation, userResolution.reason, options);
  }

  const session = correlation.sessionId
    ? store.require(correlation.sessionId)
    : store.create(scenario);
  const userText = userResolution.text;

  if (session.phase === "patient_opening") {
    transitionPhase(session, "anamnesis_active", scenario, store);
  }

  store.appendTurn(session, "user", userText, "text_mock");

  const guardrail = evaluateGuardrails(userText);
  let responseDe: string;
  let blockedFactIds: string[] = [];
  let safetyFlag: string | undefined;
  let patientBehavior:
    | ReturnType<typeof resolveHiddenFacts>["behavior"]
    | undefined;

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
    const conversationLastAssistantDe = findLastAssistantResponse(parsed.messages);
    const resolution = resolveHiddenFacts(userText, session, scenario, {
      conversationLastAssistantDe,
    });
    responseDe = resolution.responseDe;
    blockedFactIds = resolution.blockedFactIds;
    patientBehavior = resolution.behavior;
  }

  if (!guardrail.blocked && isPatientConversationPhase(session.phase)) {
    session.lastPatientResponseDe = responseDe;
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

  const promptEnvelope = buildAuthoritativePatientContext(scenario, parsed.messages);
  const promptText = [promptEnvelope.systemPromptDe, userText].join("\n");
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
      grounding,
      session: serialized,
      patient_behavior: patientBehavior
        ? {
            response_class: patientBehavior.responseClass,
            intent: patientBehavior.intent,
            question_quality: patientBehavior.questionQuality,
            matched_fact_id: patientBehavior.matchedFactId ?? null,
            matched_alias_id: patientBehavior.matchedAliasId ?? null,
            fallback_reason: patientBehavior.fallbackReason ?? null,
          }
        : undefined,
    },
  };
}

export async function handleChatCompletionPost(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const receivedAt = new Date().toISOString();
  const startedAt = Date.now();
  let requestShape: ReturnType<typeof describeCustomLlmRequestShape> | undefined;
  const diagnosticRunId = request.headers.get("x-fsp-diagnostic-run-id") ?? undefined;
  let correlationSessionId: string | undefined;

  try {
    const body = await request.json();
    requestShape = describeCustomLlmRequestShape(body);
    const headerSessionId = request.headers.get("x-fsp-session-id") ?? undefined;
    correlationSessionId =
      headerSessionId ??
      (typeof body?.session_id === "string" ? body.session_id : undefined);

    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "custom_llm_request",
        {
          request_shape: requestShape,
          session_id_prefix: (headerSessionId ?? body?.session_id ?? "none")
            .toString()
            .slice(0, 8),
        },
        "server",
        requestId,
      );
    }

    const wantsStream =
      typeof body === "object" &&
      body !== null &&
      (body as { stream?: unknown }).stream === true;

    const parsedRequest = OpenAIChatCompletionRequestSchema.safeParse(body);
    const latestUserResolution = parsedRequest.success
      ? resolveLatestUserMessage(parsedRequest.data.messages)
      : null;
    const latestUserTextPrefix =
      latestUserResolution?.kind === "text"
        ? sanitizeUserTextPrefix(latestUserResolution.text)
        : null;

    const result = processChatCompletion(body, { headerSessionId });

    const latencyMs = Date.now() - startedAt;
    const routeProof = buildCallbackRouteProof({
      request,
      stream: wantsStream,
      latestUserTextLen: requestShape.latest_user_text_len,
      httpStatus: 200,
      scenarioContextLoaded: result.x_fsp.grounding?.scenario_context_loaded ?? false,
      promptSource: result.x_fsp.grounding?.prompt_source ?? null,
      scenarioId: result.x_fsp.grounding?.scenario_id ?? null,
      assistantContent: result.choices[0]?.message.content ?? null,
    });

    const logPayload = {
      request_id: requestId,
      received_at: receivedAt,
      status: 200,
      latency_ms: latencyMs,
      request_shape: requestShape,
      correlation: result.x_fsp.correlation.session_id_source,
      session_id_prefix: (result.x_fsp.session_id || "none").slice(0, 8),
      user_text_len: requestShape.latest_user_text_len,
      vad_noop: result.x_fsp.vad_noop ?? false,
      vad_noop_reason: result.x_fsp.vad_noop_reason ?? null,
      correlation_method: result.x_fsp.grounding?.correlation_method ?? null,
      ignored_incoming_system_messages:
        result.x_fsp.grounding?.ignored_incoming_system_messages ?? 0,
      has_assistant_content: Boolean(result.choices[0]?.message.content),
      assistant_content_len: result.choices[0]?.message.content?.length ?? 0,
      diagnostic_run_id: diagnosticRunId ?? null,
      latest_user_text_prefix: latestUserTextPrefix,
      normalized_user_text_prefix: latestUserTextPrefix
        ? sanitizeUserTextPrefix(normalizePatientText(latestUserTextPrefix))
        : null,
      patient_behavior_present: Boolean(result.x_fsp.patient_behavior),
      response_class: result.x_fsp.patient_behavior?.response_class ?? null,
      patient_behavior_intent: result.x_fsp.patient_behavior?.intent ?? null,
      matched_fact_id: result.x_fsp.patient_behavior?.matched_fact_id ?? null,
      matched_alias_id: result.x_fsp.patient_behavior?.matched_alias_id ?? null,
      fallback_reason: result.x_fsp.patient_behavior?.fallback_reason ?? null,
      ...routeProof,
    };

    console.info("[custom-llm]", logPayload);

    const { matchedRunIds, correlationMethod } =
      liveAvatarDiagnosticStore.recordCustomLlmCallback({
        request_id: requestId,
        received_at: receivedAt,
        status: 200,
        latency_ms: latencyMs,
        request_shape: requestShape,
        correlation: result.x_fsp.correlation.session_id_source,
        fsp_session_id: result.x_fsp.session_id || undefined,
        message_count: requestShape.message_count,
        user_preview_len: requestShape.latest_user_text_len,
        has_assistant_content: logPayload.has_assistant_content,
        assistant_content_present: logPayload.has_assistant_content,
        vad_noop: logPayload.vad_noop,
        roles: requestShape.roles,
        latest_user_content_kind: requestShape.latest_user_content_kind,
        ...routeProof,
      });

    if (diagnosticRunId && !matchedRunIds.includes(diagnosticRunId)) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "custom_llm_result",
        {
          ...logPayload,
          correlation_method: "header_diagnostic_run_id",
        },
        "server",
        requestId,
      );
    } else if (matchedRunIds.length > 0) {
      for (const runId of matchedRunIds) {
        liveAvatarDiagnosticStore.appendEvent(
          runId,
          "custom_llm_result",
          {
            ...logPayload,
            correlation_method: correlationMethod,
          },
          "server",
          requestId,
        );
      }
    }

    const responseHeaders: Record<string, string> = {
      "x-fsp-request-id": requestId,
    };
    if (result.x_fsp.session_persisted !== false && result.x_fsp.session_id) {
      responseHeaders["x-fsp-session-id"] = result.x_fsp.session_id;
    }

    if (wantsStream) {
      return new Response(encodeOpenAiStreamingBody(result), {
        status: 200,
        headers: {
          ...OPENAI_STREAMING_HEADERS,
          ...responseHeaders,
        },
      });
    }

    return NextResponse.json(result, {
      headers: responseHeaders,
    });
  } catch (error) {
    const httpError = toHttpError(error);
    const latencyMs = Date.now() - startedAt;
    console.info("[custom-llm]", {
      request_id: requestId,
      received_at: receivedAt,
      status: httpError.status,
      latency_ms: latencyMs,
      request_shape: requestShape,
      diagnostic_run_id: diagnosticRunId ?? null,
      error_code:
        typeof httpError.body === "object" &&
        httpError.body !== null &&
        "error" in httpError.body &&
        typeof (httpError.body as { error?: { code?: string } }).error?.code ===
          "string"
          ? (httpError.body as { error: { code: string } }).error.code
          : "unknown",
    });

    liveAvatarDiagnosticStore.recordCustomLlmCallback({
      request_id: requestId,
      received_at: receivedAt,
      status: httpError.status,
      latency_ms: latencyMs,
      request_shape: requestShape,
      fsp_session_id: correlationSessionId,
      has_assistant_content: false,
      vad_noop: false,
    });

    if (diagnosticRunId) {
      liveAvatarDiagnosticStore.appendEvent(
        diagnosticRunId,
        "custom_llm_result",
        {
          status: httpError.status,
          latency_ms: latencyMs,
          request_shape: requestShape,
        },
        "server",
        requestId,
      );
    }

    return NextResponse.json(httpError.body, {
      status: httpError.status,
      headers: { "x-fsp-request-id": requestId },
    });
  }
}
