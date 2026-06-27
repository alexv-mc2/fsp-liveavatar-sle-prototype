import { normalizePatientText } from "./normalize";

export function normalizedTokens(value: string): string[] {
  return normalizePatientText(value)
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function containsNormalizedTerm(
  normalizedInput: string,
  normalizedTerm: string,
): boolean {
  const term = normalizedTerm.trim();
  if (!term) {
    return false;
  }

  const phrase = term.replace(/-/g, " ");
  const input = normalizedInput.replace(/-/g, " ");

  if (phrase.includes(" ")) {
    return input.includes(phrase);
  }

  return new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$|\\?)`).test(input);
}

export function matchesAnyAlias(input: string, aliases: string[]): string | null {
  const normalizedInput = normalizePatientText(input);
  for (const alias of aliases) {
    const normalizedAlias = normalizePatientText(alias);
    if (containsNormalizedTerm(normalizedInput, normalizedAlias)) {
      return alias;
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
