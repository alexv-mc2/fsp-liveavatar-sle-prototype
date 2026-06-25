import { NextResponse } from "next/server";
import { processChatCompletion } from "@/server/routes/chatCompletions";
import { toHttpError } from "@/server/routes/errorResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = processChatCompletion(body, {
      headerSessionId: request.headers.get("x-fsp-session-id") ?? undefined,
    });
    return NextResponse.json(result, {
      headers: { "x-fsp-session-id": result.x_fsp.session_id },
    });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
