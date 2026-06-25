import { ZodError } from "zod";
import { InvalidPhaseTransitionError } from "../fsp/phaseMachine";
import { SessionNotFoundError } from "../fsp/scenarioState";
import {
  MissingUserMessageError,
  UnsupportedStreamingError,
} from "./chatCompletions";
import { HeyGenNotConfiguredError } from "../integrations/heygen/errors";
import {
  EmptyUserMessageError,
  InvalidSessionIdError,
} from "../integrations/customLlm/correlation";

export interface HttpErrorPayload {
  status: number;
  body: {
    error: {
      message: string;
      type: string;
      code: string;
      details?: unknown;
      missing_env?: string[];
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

  if (error instanceof MissingUserMessageError) {
    return {
      status: 400,
      body: {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "missing_user_message",
        },
      },
    };
  }

  if (error instanceof EmptyUserMessageError) {
    return {
      status: 400,
      body: {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "empty_user_message",
        },
      },
    };
  }

  if (error instanceof InvalidSessionIdError) {
    return {
      status: 400,
      body: {
        error: {
          message: error.message,
          type: "invalid_request_error",
          code: "invalid_session_id",
          details: { field: error.field },
        },
      },
    };
  }

  if (error instanceof HeyGenNotConfiguredError) {
    return {
      status: 503,
      body: {
        error: {
          message: error.message,
          type: "integration_error",
          code: "not_configured",
          missing_env: error.missingEnv,
        },
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      body: {
        error: {
          message: "Invalid JSON in request body.",
          type: "invalid_request_error",
          code: "invalid_json",
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
