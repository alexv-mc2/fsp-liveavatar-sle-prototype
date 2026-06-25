import { loadScenario } from "../fsp/scenarioLoader";

export function getHealthPayload() {
  const scenario = loadScenario();
  return {
    status: "ok",
    service: "fsp-liveavatar-sle-prototype",
    case_id: scenario.metadata.id,
    scenario_status: scenario.metadata.content_status,
    medical_verification: scenario.metadata.medical_verification,
    heygen: "mock_not_connected",
    storage: "in_memory_no_raw_audio",
    timestamp: new Date().toISOString(),
  } as const;
}
