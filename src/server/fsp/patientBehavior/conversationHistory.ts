import type { ParsedChatMessage } from "@/server/integrations/customLlm/messageExtraction";
import { messageContentToText } from "@/server/integrations/customLlm/messageExtraction";

/** Last assistant turn before the latest user message (HeyGen/LiveAvatar history). */
export function findLastAssistantResponse(
  messages: ParsedChatMessage[],
): string | null {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const role = messages[index]?.role;
    if (role === "user") {
      const text = messageContentToText(messages[index]?.content).trim();
      if (text) {
        latestUserIndex = index;
        break;
      }
    }
  }

  if (latestUserIndex <= 0) {
    return null;
  }

  for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "assistant") {
      continue;
    }
    const text = messageContentToText(messages[index]?.content).trim();
    if (text) {
      return text;
    }
  }

  return null;
}
