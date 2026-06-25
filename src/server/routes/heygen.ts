import { NextResponse } from "next/server";
import { toHttpError } from "./errorResponse";
import {
  createHeyGenSessionTokenNotConfigured,
  getHeyGenIntegrationStatus,
} from "../integrations/heygen/sessionToken";

export function getHeyGenStatusPayload() {
  return getHeyGenIntegrationStatus();
}

export async function handleHeyGenSessionTokenPost(request: Request) {
  try {
    const body = await request.json();
    const payload = createHeyGenSessionTokenNotConfigured(body);
    return NextResponse.json(payload, { status: 503 });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
