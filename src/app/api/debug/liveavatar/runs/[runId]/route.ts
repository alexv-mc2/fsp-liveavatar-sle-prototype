import { handleDiagnosticGetRun } from "@/server/routes/liveAvatarDiagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  return handleDiagnosticGetRun(runId);
}
