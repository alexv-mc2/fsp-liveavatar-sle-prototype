import { loadScenario } from "../fsp/scenarioLoader";
import { PROVENANCE_LABELS, SOURCE_STATUS } from "../content/sourceRegister";

export function getHealthPayload() {
  const scenario = loadScenario();
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
    heygen: "mock_not_connected",
    storage: "in_memory_no_raw_audio",
    timestamp: new Date().toISOString(),
  } as const;
}
