import { NextResponse } from "next/server";
import { FspPhaseSchema } from "@/server/fsp/types";
import { setSessionPhase } from "@/server/routes/sessions";
import { toHttpError } from "@/server/routes/errorResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = (await request.json()) as { phase?: unknown };
    const phase = FspPhaseSchema.parse(body.phase);
    return NextResponse.json({ session: setSessionPhase(sessionId, phase) });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
