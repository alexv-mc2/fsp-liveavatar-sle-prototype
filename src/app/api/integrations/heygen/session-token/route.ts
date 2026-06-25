import { handleHeyGenSessionTokenPost } from "@/server/routes/heygen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleHeyGenSessionTokenPost(request);
}
