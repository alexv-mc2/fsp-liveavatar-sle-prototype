import { normalizePatientText } from "./normalize";

/** Hausarzt / family-doctor questions — must not route to home/living facts. */
export function isGpQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);

  if (
    /\b(hausarzt|hausarztin|hausarztpraxis|familienarzt|family doctor)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/\b(mein arzt|meine arztin)\b/.test(normalized)) {
    return true;
  }
  if (/\bhaus\b.*\b(artz|arzt)\b/.test(normalized)) {
    return true;
  }
  if (/\b(artz|arzt)\b.*\bhaus\b/.test(normalized)) {
    return true;
  }
  if (/^haus artz$|^haus arzt$|^haus arztin$/.test(normalized)) {
    return true;
  }
  if (/\bhaus arzt\b|\bhaus artz\b/.test(normalized)) {
    return true;
  }
  return false;
}

export function isPartialGpSttFragment(input: string): boolean {
  const normalized = normalizePatientText(input).trim();
  return normalized === "haus" || normalized === "mein haus";
}
