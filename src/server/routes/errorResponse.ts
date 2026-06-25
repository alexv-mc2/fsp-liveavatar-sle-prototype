import { ZodError } from "zod";
import { InvalidPhaseTransitionError } from "../fsp/phaseMachine";
import { SessionNotFoundError } from "../fsp/scenarioState";
import { UnsupportedStreamingError } from "./chatCompletions";

export interface HttpErrorPayload {
  status: number;
  body: {
    error: {
      message: string;
      type: string;
      code: string;
      details?: unknown;
    };
  };
}

export function toHttpError(error: unknown): HttpErrorPayload {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          message: "Request validation failed.",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.issues,
        },
      },
    };
  }

  if (error instanceof SessionNotFoundError) {
    return {
      status: 404,
      body: {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "session_not_found",
        },
      },
    };
  }

  if (error instanceof InvalidPhaseTransitionError) {
    return {
      status: 409,
      body: {
        error: {
          message: error.message,
          type: "state_conflict",
          code: "invalid_phase_transition",
        },
      },
    };
  }

  if (error instanceof UnsupportedStreamingError) {
    return {
      status: 400,
      body: {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "streaming_not_implemented",
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        message: "Internal prototype error.",
        type: "server_error",
        code: "internal_error",
      },
    },
  };
}
