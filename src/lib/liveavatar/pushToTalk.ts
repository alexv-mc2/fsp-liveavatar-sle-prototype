import type { VoiceChat } from "@heygen/liveavatar-web-sdk";

const SDK_PTT_MODE_LOG_PREFIX = "Session interactivity mode";

function withSuppressedSdkPushToTalkModeLog<T>(action: () => Promise<T>) {
  const previousConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    if (args[0] === SDK_PTT_MODE_LOG_PREFIX) {
      return;
    }

    previousConsoleError(...args);
  };

  return action().finally(() => {
    console.error = previousConsoleError;
  });
}

export async function startSdkPushToTalk(voiceChat: VoiceChat) {
  await withSuppressedSdkPushToTalkModeLog(() => voiceChat.startPushToTalk());
}

export async function stopSdkPushToTalk(voiceChat: VoiceChat) {
  await withSuppressedSdkPushToTalkModeLog(() => voiceChat.stopPushToTalk());
}
