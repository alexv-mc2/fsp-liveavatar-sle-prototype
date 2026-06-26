import type { DiagnosticBreakpoint, DiagnosticRun } from "@/lib/liveavatar/diagnosticTypes";

function hasPhase(run: DiagnosticRun, ...phases: string[]): boolean {
  return run.events.some((event) => phases.includes(event.phase));
}

function lastPayload(
  run: DiagnosticRun,
  phase: string,
): Record<string, unknown> | undefined {
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    const event = run.events[i];
    if (event?.phase === phase) {
      return event.payload;
    }
  }
  return undefined;
}

function llmCallbacks(run: DiagnosticRun) {
  return run.events.filter((event) =>
    ["custom_llm_callback", "custom_llm_request", "custom_llm_result"].includes(
      event.phase,
    ),
  );
}

function avatarSpoke(run: DiagnosticRun): boolean {
  return (
    hasPhase(run, "avatar_speak_started", "avatar_speak_ended") ||
    run.events.some(
      (event) =>
        event.phase === "sdk_event" &&
        (event.payload?.name === "AVATAR_SPEAK_STARTED" ||
          event.payload?.agent_event === "AVATAR_SPEAK_STARTED" ||
          event.payload?.agent_event === "avatar.speak_started"),
    )
  );
}

function userEngaged(run: DiagnosticRun): boolean {
  return (
    hasPhase(
      run,
      "ptt_start",
      "ptt_stop",
      "conversational_listening_start",
      "conversational_listening_stop",
    ) || llmCallbacks(run).length > 0
  );
}

export function classifyDiagnosticRun(run: DiagnosticRun): DiagnosticBreakpoint {
  if (
    hasPhase(
      run,
      "session_token_failure",
      "session_token_error",
      "token_mint_failed",
    )
  ) {
    return "TOKEN_FAIL";
  }

  const tokenFailure = lastPayload(run, "session_token_result");
  if (tokenFailure?.ok === false || tokenFailure?.http_status === 503) {
    return "TOKEN_FAIL";
  }

  if (
    hasPhase(run, "sdk_start_failure", "sdk_error", "sdk_start_failed") ||
    lastPayload(run, "sdk_disconnected")?.reason === "SESSION_START_FAILED"
  ) {
    return "SDK_START_FAIL";
  }

  const mic = lastPayload(run, "mic_permission");
  if (mic?.state === "denied") {
    return "MIC_FAIL";
  }

  if (
    run.endedAt &&
    hasPhase(run, "sdk_start_success", "sdk_started") &&
    !hasPhase(run, "stream_ready") &&
    !run.events.some(
      (event) =>
        event.phase === "sdk_event" && event.payload?.name === "SESSION_STREAM_READY",
    )
  ) {
    return "VIDEO_FAIL";
  }

  const llmEvents = llmCallbacks(run);
  const llm400 = llmEvents.some((event) => event.payload?.status === 400);
  if (llm400) {
    return "LLM_400";
  }

  const llm200NoContent = llmEvents.some(
    (event) =>
      event.payload?.status === 200 &&
      event.payload?.has_assistant_content === false &&
      event.payload?.vad_noop !== true,
  );
  if (llm200NoContent) {
    return "LLM_200_NO_CONTENT";
  }

  const userSpoke = hasPhase(
    run,
    "ptt_start",
    "ptt_stop",
    "conversational_listening_start",
    "conversational_listening_stop",
  );

  if (userSpoke && llmEvents.length === 0 && run.endedAt && !avatarSpoke(run)) {
    return "NO_LLM_CALLBACK";
  }

  const llmWithContent = llmEvents.some(
    (event) =>
      event.payload?.status === 200 && event.payload?.has_assistant_content === true,
  );

  if (llmWithContent && !avatarSpoke(run) && run.endedAt) {
    return "LLM_200_CONTENT_NO_AUDIO";
  }

  const rtpSnapshots = run.events.filter((event) =>
    ["outbound_rtp_snapshot", "audio_track_snapshot"].includes(event.phase),
  );
  const noOutbound = rtpSnapshots.some(
    (event) =>
      event.payload?.rtp &&
      typeof event.payload.rtp === "object" &&
      (event.payload.rtp as { bytesSent?: number }).bytesSent === 0,
  );
  if (userSpoke && noOutbound) {
    return "NO_OUTBOUND_AUDIO";
  }

  const remoteMuted = run.events.some(
    (event) =>
      (event.phase === "remote_audio_snapshot" ||
        event.phase === "stream_ready" ||
        event.phase === "outbound_rtp_snapshot") &&
      event.payload?.remote &&
      typeof event.payload.remote === "object" &&
      (event.payload.remote as { muted?: boolean }).muted === true,
  );
  if (remoteMuted) {
    return "PLAYBACK_MUTED";
  }

  if (avatarSpoke(run) && userEngaged(run)) {
    return "AVATAR_RESPONDED";
  }

  if (run.endedAt) {
    return "UNKNOWN";
  }

  return "UNKNOWN";
}
