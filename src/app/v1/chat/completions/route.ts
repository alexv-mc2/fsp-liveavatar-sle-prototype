import { handleChatCompletionPost } from "@/server/routes/chatCompletions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleChatCompletionPost;
