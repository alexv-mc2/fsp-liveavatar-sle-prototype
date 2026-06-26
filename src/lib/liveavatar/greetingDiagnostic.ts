import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";

const GREETING_PROBE_TEXT = "Diagnose-Test. Bitte kurz antworten.";

export type GreetingDiagnosticResult =
  | {
      supported: true;
      method: "repeat";
      command_id_prefix: string;
      sdk_api: "LiveAvatarSession.repeat(message: string): string";
    }
  | {
      supported: false;
      phase: "GREETING_UNSUPPORTED";
      sdk_api_evidence: string;
      package: "@heygen/liveavatar-web-sdk";
    };

export function runGreetingDiagnostic(
  session: LiveAvatarSession,
): GreetingDiagnosticResult {
  const repeatFn = session.repeat;
  if (typeof repeatFn !== "function") {
    return {
      supported: false,
      phase: "GREETING_UNSUPPORTED",
      sdk_api_evidence:
        "typeof session.repeat !== 'function' on LiveAvatarSession instance",
      package: "@heygen/liveavatar-web-sdk",
    };
  }

  const commandId = repeatFn.call(session, GREETING_PROBE_TEXT);
  return {
    supported: true,
    method: "repeat",
    command_id_prefix:
      typeof commandId === "string" && commandId.length >= 8
        ? `${commandId.slice(0, 8)}…`
        : "unknown",
    sdk_api: "LiveAvatarSession.repeat(message: string): string",
  };
}
