import { normalizePatientText } from "./normalize";
import type { ResponseClass } from "./types";
import type { SleScenario } from "../types";

function spellNameSlow(name: string): string {
  return `${name}: ${name.toUpperCase().split("").join(" - ")}.`;
}

export function buildBiographyResponse(
  intent: string,
  scenario: SleScenario,
  input?: string,
): { responseDe: string; responseClass: ResponseClass } {
  const { patient } = scenario;
  const normalizedInput = input ? normalizePatientText(input) : "";

  switch (intent) {
    case "biography.name":
      return {
        responseDe: `Ich heiße ${patient.given_name} ${patient.family_name}.`,
        responseClass: "neutral_default",
      };
    case "biography.given_name_spelling":
      return {
        responseDe: spellNameSlow(patient.given_name),
        responseClass: "neutral_default",
      };
    case "biography.family_name_spelling":
      return {
        responseDe: spellNameSlow(patient.family_name),
        responseClass: "neutral_default",
      };
    case "biography.full_name_spelling":
      return {
        responseDe: `${spellNameSlow(patient.given_name)} ${spellNameSlow(patient.family_name)}`,
        responseClass: "neutral_default",
      };
    case "biography.dob":
      if (/\bgeburtsdatum\b/.test(normalizedInput)) {
        return {
          responseDe: `Mein Geburtsdatum ist der ${patient.date_of_birth}.`,
          responseClass: "neutral_default",
        };
      }
      return {
        responseDe: `Ich bin am ${patient.date_of_birth_spoken_de} geboren.`,
        responseClass: "neutral_default",
      };
    case "biography.age":
      return {
        responseDe: `Ich bin ${patient.age_years} Jahre alt.`,
        responseClass: "neutral_default",
      };
    case "biography.height":
      return {
        responseDe: `Ich bin ${patient.height_spoken_de} groß.`,
        responseClass: "neutral_default",
      };
    case "biography.weight":
      return {
        responseDe: `Ich wiege ${patient.weight_current_spoken_de}.`,
        responseClass: "neutral_default",
      };
    case "biography.weight_change":
      return {
        responseDe: `Ich wiege jetzt ${patient.weight_current_spoken_de}, ${patient.weight_previous_spoken_de}.`,
        responseClass: "neutral_default",
      };
    case "biography.gp":
      return {
        responseDe: `Mein Hausarzt ist ${patient.gp_name_de} in Düsseldorf.`,
        responseClass: "neutral_default",
      };
    case "biography.occupation":
      return {
        responseDe: `Ich arbeite als ${patient.occupation_de}.`,
        responseClass: "neutral_default",
      };
    default:
      return {
        responseDe: scenario.fallbacks.unknown_de,
        responseClass: "patient_unknown",
      };
  }
}

export function inferRepeatBiographyIntent(input: string): string | null {
  const normalized = normalizePatientText(input);
  if (/\b(vorname|vornamen)\b/.test(normalized)) {
    return /\bbuchstab/.test(normalized)
      ? "biography.given_name_spelling"
      : "biography.name";
  }
  if (/\b(nachname|nachnamen)\b/.test(normalized)) {
    return /\bbuchstab/.test(normalized)
      ? "biography.family_name_spelling"
      : "biography.name";
  }
  if (/\b(name|namen)\b/.test(normalized)) {
    return /\bbuchstab/.test(normalized)
      ? "biography.full_name_spelling"
      : "biography.name";
  }
  if (/\b(geburtsdatum|geboren|geburtstag|datum)\b/.test(normalized)) {
    return "biography.dob";
  }
  if (/\b(alter|jahre alt)\b/.test(normalized)) {
    return "biography.age";
  }
  if (/\b(groesse|gross|koerpergroesse)\b/.test(normalized)) {
    return "biography.height";
  }
  if (/\b(gewicht|wiegen|abgenommen)\b/.test(normalized)) {
    return /\b(abgenommen|fruher|frueher|verloren|weniger)\b/.test(normalized)
      ? "biography.weight_change"
      : "biography.weight";
  }
  if (/\b(hausarzt|hausarztin|haus arzt|haus artz)\b/.test(normalized)) {
    return "biography.gp";
  }
  return null;
}
