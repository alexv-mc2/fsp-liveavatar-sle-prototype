import { prefixUuid } from "./diagnosticSanitize";
import {
  buildCustomLlmUrl,
  buildLiveAvatarLlmConfigBaseUrl,
  readHeyGenEnvSnapshot,
  readLiveAvatarRuntimeConfig,
} from "../integrations/heygen/env";

export type RouteProofSnapshot = {
  llm_env_source: string | null;
  llm_configuration_id_prefix: string | null;
  llm_configuration_base_url_host: string | null;
  llm_configuration_base_url_path: string | null;
  deployment_host: string | null;
  deployment_base_url: string | null;
  expected_callback_host: string | null;
  expected_callback_path: string;
  session_token_minted_with_config_prefix: string | null;
  config_route_match: boolean;
};

export type CallbackRouteProof = {
  custom_llm_callback_received: boolean;
  callback_request_host: string | null;
  callback_request_path: string | null;
  stream: boolean;
  latest_user_text_len: number;
  http_status: number;
  scenario_context_loaded: boolean;
  prompt_source: string | null;
  scenario_id: string | null;
  grounded_response_preview: string | null;
  route_match: boolean;
};

const GENERIC_UNKNOWN_PATTERNS = [
  /^das weiß ich leider nicht\.?$/i,
  /^ich weiß das leider nicht\.?$/i,
];

function isSamePreviewProjectHost(
  llmHost: string | null,
  deploymentHost: string | null,
): boolean {
  if (!llmHost || !deploymentHost) {
    return false;
  }
  if (llmHost === deploymentHost) {
    return true;
  }
  const projectPrefix = "fsp-liveavatar-sle-prototype";
  return (
    llmHost.startsWith(`${projectPrefix}-`) &&
    llmHost.endsWith(".vercel.app") &&
    deploymentHost.startsWith(`${projectPrefix}-`) &&
    deploymentHost.endsWith(".vercel.app")
  );
}

export function resolveDeploymentHost(): string | null {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  const publicBase = process.env.FSP_PUBLIC_BASE_URL?.trim();
  if (publicBase) {
    try {
      return new URL(
        publicBase.startsWith("http") ? publicBase : `https://${publicBase}`,
      ).host;
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveDeploymentBaseUrl(): string | null {
  const host = resolveDeploymentHost();
  return host ? `https://${host}` : null;
}

export function parseUrlHostPath(raw: string | null | undefined): {
  host: string | null;
  path: string | null;
} {
  if (!raw?.trim()) {
    return { host: null, path: null };
  }
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return { host: url.host, path: url.pathname.replace(/\/+$/, "") || "/" };
  } catch {
    return { host: null, path: null };
  }
}

export function buildExpectedCallbackPath(): string {
  return "/v1/chat/completions";
}

export function inferLlmConfigBaseUrlFromEnv(): {
  host: string | null;
  path: string | null;
  source: string | null;
} {
  const snapshot = readHeyGenEnvSnapshot();
  const publicBase =
    snapshot.publicBaseUrl ??
    resolveDeploymentBaseUrl() ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`
      : null);

  if (!publicBase) {
    return { host: null, path: null, source: null };
  }

  const baseUrl = buildLiveAvatarLlmConfigBaseUrl(publicBase);
  const { host, path } = parseUrlHostPath(baseUrl);
  return {
    host,
    path,
    source: snapshot.publicBaseUrlSource ?? "VERCEL_URL",
  };
}

export function buildRouteProofSnapshot(options: {
  llmConfigurationId?: string | null;
  llmConfigBaseUrl?: string | null;
  llmEnvSource?: string | null;
} = {}): RouteProofSnapshot {
  const snapshot = readHeyGenEnvSnapshot();
  const runtime = readLiveAvatarRuntimeConfig();
  const inferred = inferLlmConfigBaseUrlFromEnv();
  const configuredBase = options.llmConfigBaseUrl ?? null;
  const configuredParsed = parseUrlHostPath(configuredBase);
  const deploymentHost = resolveDeploymentHost();
  const deploymentBase = resolveDeploymentBaseUrl();

  const llmId =
    options.llmConfigurationId ??
    runtime?.llmConfigurationId ??
    null;
  const llmEnvSource =
    options.llmEnvSource ??
    snapshot.resolvedFrom.llmConfigurationId ??
    null;

  return {
    llm_env_source: llmEnvSource,
    llm_configuration_id_prefix: prefixUuid(llmId) ?? null,
    llm_configuration_base_url_host:
      configuredParsed.host ?? inferred.host ?? null,
    llm_configuration_base_url_path:
      configuredParsed.path ?? inferred.path ?? "/v1",
    deployment_host: deploymentHost,
    deployment_base_url: deploymentBase,
    expected_callback_host: deploymentHost,
    expected_callback_path: buildExpectedCallbackPath(),
    session_token_minted_with_config_prefix: prefixUuid(llmId) ?? null,
    config_route_match: isSamePreviewProjectHost(
      configuredParsed.host ?? inferred.host ?? null,
      deploymentHost,
    ),
  };
}

export function compareCallbackRoute(
  requestUrl: string,
  expectedHost?: string | null,
): {
  route_match: boolean;
  callback_request_host: string | null;
  callback_request_path: string | null;
} {
  const { host, path } = parseUrlHostPath(requestUrl);
  const deploymentHost = resolveDeploymentHost();
  const expectedPath = buildExpectedCallbackPath();
  const normalizedPath = path?.replace(/\/+$/, "") ?? null;
  const hostMatches =
    host === (expectedHost ?? deploymentHost) ||
    isSamePreviewProjectHost(host, expectedHost ?? deploymentHost);

  return {
    route_match:
      Boolean(host) &&
      hostMatches &&
      normalizedPath === expectedPath,
    callback_request_host: host,
    callback_request_path: normalizedPath,
  };
}

export function buildCallbackRouteProof(input: {
  request: Request;
  stream: boolean;
  latestUserTextLen: number;
  httpStatus: number;
  scenarioContextLoaded: boolean;
  promptSource: string | null;
  scenarioId: string | null;
  assistantContent: string | null;
  expectedCallbackHost?: string | null;
}): CallbackRouteProof {
  const route = compareCallbackRoute(input.request.url, input.expectedCallbackHost);
  const preview = capGroundedPreview(input.assistantContent);

  return {
    custom_llm_callback_received: true,
    callback_request_host: route.callback_request_host,
    callback_request_path: route.callback_request_path,
    stream: input.stream,
    latest_user_text_len: input.latestUserTextLen,
    http_status: input.httpStatus,
    scenario_context_loaded: input.scenarioContextLoaded,
    prompt_source: input.promptSource,
    scenario_id: input.scenarioId,
    grounded_response_preview: preview,
    route_match: route.route_match,
  };
}

export function capGroundedPreview(content: string | null | undefined): string | null {
  if (!content?.trim()) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

export function isGenericUnknownResponse(content: string | null | undefined): boolean {
  if (!content?.trim()) {
    return true;
  }
  return GENERIC_UNKNOWN_PATTERNS.some((pattern) => pattern.test(content.trim()));
}

export function buildCustomLlmUrlForSnapshot(): string | null {
  const base = resolveDeploymentBaseUrl() ?? readHeyGenEnvSnapshot().publicBaseUrl;
  return base ? buildCustomLlmUrl(base) : null;
}
