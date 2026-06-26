import { loadScenario } from "../fsp/scenarioLoader";
import { PROVENANCE_LABELS, SOURCE_STATUS } from "../content/sourceRegister";
import { getHeyGenIntegrationStatus, enrichHeyGenStatusRouteProof } from "../integrations/heygen/sessionToken";

export async function getHealthPayload() {
  const scenario = loadScenario();
  const heygen = await enrichHeyGenStatusRouteProof(getHeyGenIntegrationStatus());
  return {
    status: "ok",
    service: "fsp-liveavatar-sle-prototype",
    case_id: scenario.metadata.id,
    scenario_status: scenario.metadata.content_status,
    medical_verification: scenario.metadata.medical_verification,
    provenance_labels: PROVENANCE_LABELS,
    source_register: Object.values(SOURCE_STATUS).map((entry) => ({
      id: entry.id,
      status: entry.status,
    })),
    heygen: heygen.session_token_configured
      ? "liveavatar_session_token_configured"
      : "mock_not_connected",
    heygen_integration: heygen,
    storage: "in_memory_no_raw_audio",
    timestamp: new Date().toISOString(),
  } as const;
}
