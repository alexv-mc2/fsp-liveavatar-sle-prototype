import { isPatientConversationPhase } from "./phaseMachine";
import type { FspPhase, SleScenario } from "./types";

export interface ResponseValidationResult {
  responseDe: string;
  replaced: boolean;
  reason?: string;
}

const LAB_LEAK_PATTERNS = [
  /\b1\s*:\s*640\b/i,
  /\b3[,.]2\s*(?:\/\s*nl|g\s*\/\s*l|g\/l)\b/i,
  /\b10[,.]8\s*g\s*\/\s*dl\b/i,
  /\b168\s*g\s*\/\s*l\b/i,
  /\b95\s*iu\s*\/\s*ml\b/i,
  /\b0[,.]67\s*g\s*\/\s*l\b/i,
  /\b0[,.]09\s*g\s*\/\s*g\b/i,
  /\banti[- ]?dsdna\b/i,
  /\banti[- ]?sm\b/i,
  /\bupcr\b/i,
  /\b(eular|acr)\b/i,
  /\bklassifikations\s*(?:score|punkte)\b/i,
  /\b25\s*punkte\b/i,
];

export function validatePatientResponse(
  responseDe: string,
  phase: FspPhase,
  scenario: SleScenario,
): ResponseValidationResult {
  const cleaned = responseDe.trim();
  const trimmed = cleaned.slice(0, 480);

  if (!isPatientConversationPhase(phase)) {
    return {
      responseDe: scenario.fallbacks.non_patient_phase_de,
      replaced: true,
      reason: "patient_role_outside_patient_phase",
    };
  }

  if (LAB_LEAK_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    const classificationLeak =
      /\b(eular|acr|klassifikations|25\s*punkte)\b/i.test(cleaned);
    return {
      responseDe: classificationLeak
        ? (scenario.fallbacks.classification_in_patient_phase_de ??
            scenario.fallbacks.lab_in_patient_phase_de)
        : scenario.fallbacks.lab_in_patient_phase_de,
      replaced: true,
      reason: classificationLeak
        ? "patient_classification_leak_prevented"
        : "patient_lab_leak_prevented",
    };
  }

  return { responseDe: trimmed, replaced: false };
}
