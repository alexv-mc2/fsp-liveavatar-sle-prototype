import type { ScenarioFact } from "../types";
import { normalizePatientText } from "./normalize";

/** One short lay sentence — only what was asked, no volunteered extras. */
export function buildFocusedFactResponse(
  fact: ScenarioFact,
  input: string,
): string {
  const normalized = normalizePatientText(input);

  switch (fact.id) {
    case "chief_fatigue":
      return "Ja, ich bin seit etwa acht Wochen ungewöhnlich müde.";
    case "intermittent_fever":
      if (/\b(schuttelfrost|schuettelfrost)\b/.test(normalized)) {
        return "Nein, Schüttelfrost hatte ich nicht.";
      }
      return "Ja, manchmal bis ungefähr 38,2 Grad.";
    case "butterfly_rash":
      return "Ja, ich habe eine flache Rötung über den Wangen und der Nase bemerkt.";
    case "photosensitivity":
      return "Ja, nach viel Sonne wird mein Gesicht später deutlich röter.";
    case "weight_loss":
      if (/\b(appetit)\b/.test(normalized)) {
        return "Ja, ich habe etwas weniger Appetit.";
      }
      return "Ja, ich habe ungefähr drei Kilo in den letzten zwei Monaten abgenommen.";
    case "raynaud_negative":
      return fact.answer_de;
    default:
      return firstSentence(fact.answer_de);
  }
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.trim();
}
