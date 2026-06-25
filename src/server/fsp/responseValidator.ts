import { isPatientConversationPhase } from "./phaseMachine";
import type { FspPhase, SleScenario } from "./types";

export interface ResponseValidationResult {
  responseDe: string;
  replaced: boolean;
  reason?: string;
}

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

  const labLeakPatterns = [
    /\b1\s*:\s*640\b/i,
    /\b3[,.]2\s*\/\s*nl\b/i,
    /\b10[,.]8\s*g\s*\/\s*dl\b/i,
    /\b120\s*\/\s*nl\b/i,
    /\banti[- ]?dsdna.*hoch positiv\b/i,
  ];

  if (labLeakPatterns.some((pattern) => pattern.test(cleaned))) {
    return {
      responseDe: scenario.fallbacks.lab_in_patient_phase_de,
      replaced: true,
      reason: "patient_lab_leak_prevented",
    };
  }

  return { responseDe: trimmed, replaced: false };
}
