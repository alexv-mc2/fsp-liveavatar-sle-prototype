import { handleDiagnosticPost } from "@/server/routes/liveAvatarDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDiagnosticPost(request);
}
