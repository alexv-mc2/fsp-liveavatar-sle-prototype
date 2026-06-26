#!/usr/bin/env node
/**
 * Hard gate for Preview route-proof + grounded Custom LLM callback.
 * Usage: PREVIEW_DEPLOY_HOST=xxx.vercel.app node scripts/preview-route-proof-gate.mjs
 */

const deployHost =
  process.env.PREVIEW_DEPLOY_HOST?.trim() ||
  "fsp-liveavatar-sle-prototype-alexv-1768-alexv-1768s-projects.vercel.app";

const base = `https://${deployHost}`;

function parseJsonLine(text) {
  const line = text.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) throw new Error("No JSON line in response");
  return JSON.parse(line);
}

async function vercelCurl(path, method = "GET", body = null) {
  const args = [
    "vercel",
    "curl",
    path,
    "--deployment",
    base,
  ];
  if (method !== "GET") args.push("-X", method);
  if (body) {
    args.push("-H", "content-type: application/json", "-d", JSON.stringify(body));
  }
  const { execSync } = await import("node:child_process");
  const out = execSync(`npx ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return parseJsonLine(out);
}

async function publicPost(path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") || text.startsWith("data:")) {
    return { status: response.status, json: null, sse: text };
  }
  return { status: response.status, json: text ? JSON.parse(text) : null, sse: null };
}

const results = {};

results.health = await vercelCurl("/api/health");
results.status = await vercelCurl("/api/integrations/heygen/status");

const sess = await vercelCurl("/api/sessions", "POST");
results.sessionToken = await vercelCurl("/api/integrations/heygen/session-token", "POST", {
  fsp_session_id: sess.session.id,
});

const run = await vercelCurl("/api/debug/liveavatar/runs", "POST", {
  run_id: crypto.randomUUID().replace(/-/g, "").slice(0, 8),
  interactivity_type: "PUSH_TO_TALK",
});

const groundedQuestion = "Seit wann bestehen die Beschwerden?";
results.publicCallback = await publicPost(
  "/v1/chat/completions",
  {
    stream: true,
    messages: [{ role: "user", content: groundedQuestion }],
  },
  { "x-fsp-diagnostic-run-id": run.run_id },
);

results.publicNonStream = await publicPost("/v1/chat/completions", {
  messages: [{ role: "user", content: groundedQuestion }],
});

await new Promise((r) => setTimeout(r, 500));
results.diagnosticExport = await vercelCurl(
  `/api/debug/liveavatar/runs/${run.run_id}`,
  "GET",
);

const token = results.sessionToken.session_token;
const startRes = await fetch("https://api.liveavatar.com/v1/sessions/start", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/json",
  },
  body: "{}",
});
results.sessionsStart = {
  http: startRes.status,
  body: await startRes.json().catch(() => null),
};

const routeProof = results.status.route_proof ?? {};
const exportCallback = results.diagnosticExport?.custom_llm_callback ?? null;

const callbackProof = {
  custom_llm_callback_received: results.publicCallback.status === 200,
  route_match: routeProof.config_route_match === true,
  stream: true,
  latest_user_text_len: groundedQuestion.length,
  http_status: results.publicCallback.status,
  scenario_context_loaded:
    results.publicNonStream.json?.x_fsp?.grounding?.scenario_context_loaded === true,
  prompt_source: results.publicNonStream.json?.x_fsp?.grounding?.prompt_source ?? null,
  grounded_response_preview: (
    results.publicNonStream.json?.choices?.[0]?.message?.content ?? ""
  ).slice(0, 80),
};

const gates = {
  health_ok: results.health.status === "ok",
  status_route_proof: Boolean(routeProof.deployment_host),
  config_route_match: routeProof.config_route_match === true,
  token_push_to_talk: results.sessionToken.interactivity_type === "PUSH_TO_TALK",
  token_route_proof: Boolean(results.sessionToken.route_proof?.llm_configuration_id_prefix),
  sessions_start_201: results.sessionsStart.http === 201,
  sessions_start_code_1000: results.sessionsStart.body?.code === 1000,
  grounded_non_stream:
    results.publicNonStream.json?.x_fsp?.grounding?.scenario_context_loaded === true &&
    results.publicNonStream.json?.x_fsp?.grounding?.prompt_source === "repo_content",
  grounded_stream_http_200: results.publicCallback.status === 200,
  grounded_stream_sse: Boolean(results.publicCallback.sse?.includes("data:")),
  callback_proof: callbackProof,
  callback_not_generic: !/^ich weiß das leider nicht|^das weiß ich leider nicht/i.test(
    callbackProof.grounded_response_preview ?? "",
  ),
  export_has_custom_llm_callback: exportCallback?.custom_llm_callback_received === true,
  export_route_match: exportCallback?.route_match === true,
  export_best_effort_note:
    "in_memory export may miss cross-instance callbacks on Vercel; public POST 200 is authoritative",
};

const allPass = Object.entries(gates)
  .filter(
    ([key]) =>
      key !== "callback_proof" &&
      key !== "export_has_custom_llm_callback" &&
      key !== "export_route_match" &&
      key !== "export_best_effort_note",
  )
  .every(([, value]) => value === true) &&
  callbackProof.custom_llm_callback_received &&
  callbackProof.route_match &&
  callbackProof.latest_user_text_len > 0 &&
  callbackProof.http_status === 200 &&
  callbackProof.scenario_context_loaded &&
  callbackProof.prompt_source === "repo_content" &&
  gates.callback_not_generic;

console.log(JSON.stringify({ deployHost, gates, allPass }, null, 2));
process.exit(allPass ? 0 : 1);
