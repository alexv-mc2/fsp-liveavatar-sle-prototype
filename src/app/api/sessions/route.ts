import { NextResponse } from "next/server";
import { createSession } from "@/server/routes/sessions";
import { toHttpError } from "@/server/routes/errorResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json({ session: createSession() }, { status: 201 });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
