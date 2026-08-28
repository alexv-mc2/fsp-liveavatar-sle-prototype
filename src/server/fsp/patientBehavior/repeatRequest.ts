import { normalizePatientText } from "./normalize";

export const WHAT_TO_REPEAT_CLARIFY_DE =
  "Entschuldigung, was soll ich wiederholen?";

/** Doctor asks the patient to repeat their prior answer (LiveAvatar STT variants). */
export function isRepeatRequest(input: string): boolean {
  const normalized = normalizePatientText(input);

  if (/\b(frage|fragen)\b/.test(normalized) && /\bwiederholen\b/.test(normalized)) {
    return false;
  }

  if (normalized === "wie bitte" || /\bwie bitte\b/.test(normalized)) {
    return true;
  }
  if (
    /\b(nicht verstanden|habe sie nicht verstanden|hab sie nicht verstanden)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/\b(sagen sie das nochmal|nochmal sagen|das nochmal)\b/.test(normalized)) {
    return true;
  }
  if (/\b(bitte wiederholen|noch einmal bitte|nochmal bitte)\b/.test(normalized)) {
    return true;
  }
  if (
    /\b(das|name|namen|datum|geboren|geburtstag|spelling|buchstab)\b/.test(
      normalized,
    ) &&
    /\b(wiederholen|nochmal|noch einmal)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(wiederholen|noch einmal|nochmal)\b/.test(normalized) &&
    !/\b(frage|fragen)\b/.test(normalized)
  ) {
    return true;
  }
  return false;
}
