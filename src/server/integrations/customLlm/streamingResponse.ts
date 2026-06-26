import type { OpenAIChatCompletionResponse } from "../../routes/chatCompletions";

export type OpenAIChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: "stop" | null;
  }>;
};

export function buildOpenAiStreamingChunks(
  result: OpenAIChatCompletionResponse,
): OpenAIChatCompletionChunk[] {
  const content = result.choices[0]?.message.content ?? "";
  const base = {
    id: result.id,
    object: "chat.completion.chunk" as const,
    created: result.created,
    model: result.model,
  };

  return [
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "" },
          finish_reason: null,
        },
      ],
    },
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    },
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    },
  ];
}

export function encodeOpenAiStreamingBody(
  result: OpenAIChatCompletionResponse,
): string {
  const chunks = buildOpenAiStreamingChunks(result);
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

export const OPENAI_STREAMING_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
