import { NextResponse } from "next/server";
import { resetSession } from "@/server/routes/sessions";
import { toHttpError } from "@/server/routes/errorResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    return NextResponse.json({ session: resetSession(sessionId) });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
