import { NextResponse } from "next/server";
import { toHttpError } from "./errorResponse";
import {
  createHeyGenSessionToken,
  getHeyGenIntegrationStatus,
  LiveAvatarApiError,
} from "../integrations/heygen/sessionToken";

export function getHeyGenStatusPayload() {
  return getHeyGenIntegrationStatus();
}

export async function handleHeyGenSessionTokenPost(request: Request) {
  try {
    const body = await request.json();
    const payload = await createHeyGenSessionToken(body);

    if (payload.status === "not_configured") {
      return NextResponse.json(payload, { status: 503 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof LiveAvatarApiError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    const httpError = toHttpError(error);
    return NextResponse.json(httpError.body, { status: httpError.status });
  }
}
