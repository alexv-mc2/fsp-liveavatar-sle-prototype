export function normalizePatientText(value: string): string {
  return value
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORD_TOKENS = new Set([
  "haben",
  "habe",
  "hatte",
  "nicht",
  "eine",
  "einer",
  "einem",
  "ihre",
  "ihren",
  "meine",
  "bitte",
  "schon",
  "sehr",
  "auch",
  "noch",
  "wird",
  "waren",
  "wurde",
  "sind",
  "waren",
  "haben",
  "hatten",
]);

export function tokenizePatientText(value: string): string[] {
  return normalizePatientText(value)
    .split(" ")
    .filter((token) => token.length >= 5 && !STOPWORD_TOKENS.has(token));
}
