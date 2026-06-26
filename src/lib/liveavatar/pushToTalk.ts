import type { VoiceChat } from "@heygen/liveavatar-web-sdk";

export async function startSdkPushToTalk(voiceChat: VoiceChat) {
  await voiceChat.startPushToTalk();
  if (voiceChat.isMuted) {
    throw new Error(
      "Push-to-Talk konnte nicht gestartet werden (SDK-Modus fehlt oder Server lehnte ab).",
    );
  }
}

export async function stopSdkPushToTalk(voiceChat: VoiceChat) {
  await voiceChat.stopPushToTalk();
  await voiceChat.mute();
}
