import { normalizePatientText } from "./normalize";
import { loadPatientDialogueData } from "./dialogueData";
import { containsNormalizedTerm, matchesAnyAlias, normalizedTokens } from "./textMatch";
import type { QuestionQuality } from "./types";

const JARGON_TERMS = [
  "arthralgie",
  "arthralgien",
  "arthritis",
  "photosensibilit",
  "proteinurie",
  "dysurie",
  "hemoptyse",
  "dyspnoe",
  "dyspno",
  "zytopenie",
  "nephritis",
  "pleuritis",
  "antiphospholipid",
  "ana titer",
  "anti dsdna",
  "anti-dsdna",
  "anti sm",
  "anti-sm",
  "komplement",
  "upcr",
  "proteinurie",
  "leukopenie",
  "thrombozytopenie",
];

const EXAMINER_ONLY_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  { pattern: /\b(lupus|sle|systemischer lupus)\b/i, intent: "diagnosis.hidden" },
  { pattern: /\b(ist das|haben sie).*(lupus|rheuma bekannt|sle)\b/i, intent: "diagnosis.hidden" },
  { pattern: /\b(eular|acr|klassifikation|klassifikationspunkte|punkte haben sie)\b/i, intent: "classification" },
  { pattern: /\b(ana|anti[- ]?dsdna|anti[- ]?sm|komplement|c3|c4|bsg|crp|kreatinin|upcr|proteinurie)\b/i, intent: "laboratory" },
  { pattern: /\b(a1|anatiter|anna titer|ana titer|ana[- ]titer)\b/i, intent: "laboratory" },
  { pattern: /\b(laborwert|blutwert|titer|antikorper|antikörper)\b/i, intent: "laboratory" },
  { pattern: /\b(differentialdiagnos|bewertungsbogen)\b/i, intent: "diagnosis.hidden" },
  { pattern: /\b(therapie|behandlung|cortison|kortison|hydroxychloroquin|quensyl)\b/i, intent: "treatment" },
  { pattern: /\b(herzbeutelerguss|pleuraerguss|nierenbefund|untersucher.*festgestellt)\b/i, intent: "examiner.physical" },
  { pattern: /\b(schwangerschaftstest negativ|eular\/acr)\b/i, intent: "laboratory" },
];

const LEADING_MARKERS = [
  /\bsie haben (?:doch )?(?:bestimmt|sicher|wahrscheinlich)\b/i,
  /\bbestimmt\b.+\boder\s*\?/i,
  /\bwahrscheinlich\b.+\boder\s*\?/i,
];

const VAGUE_ONLY_PATTERNS: Array<{ pattern: RegExp; clarifyKey: string }> = [
  { pattern: /^familie[?]?$/, clarifyKey: "family" },
  { pattern: /^nehmen sie etwas[?]?$/, clarifyKey: "substances" },
  { pattern: /^trinken sie[?]?$/, clarifyKey: "alcohol" },
];

const BROAD_PATTERNS = [
  /\bwas fuhrt sie\b/,
  /\bwas führt sie\b/,
  /\bwas fehlt ihnen\b/,
  /\berzahlen sie\b/,
  /\bsonst noch beschwerden\b/,
  /\bhaben sie noch etwas\b/,
  /\bgibt es sonst\b/,
  /\bhauptbeschwerde\b/,
  /\bwas ist ihr problem\b/,
];

export function detectQuestionQualities(input: string): QuestionQuality[] {
  const normalized = normalizePatientText(input);
  const qualities: QuestionQuality[] = [];

  if (EXAMINER_ONLY_PATTERNS.some(({ pattern }) => pattern.test(normalized))) {
    qualities.push("examiner_only");
  }
  if (JARGON_TERMS.some((term) => normalized.includes(normalizePatientText(term)))) {
    qualities.push("jargon");
  }
  if (LEADING_MARKERS.some((pattern) => pattern.test(input))) {
    qualities.push("leading");
  }
  if (
    VAGUE_ONLY_PATTERNS.some(({ pattern }) => pattern.test(normalized)) ||
    (normalized === "familie" || normalized === "drogen" || normalized === "rauchen")
  ) {
    qualities.push("vague");
  }
  if (BROAD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    qualities.push("broad");
  }
  if (qualities.length === 0) {
    qualities.push("specific");
  }
  return qualities;
}

export function getVagueClarifyKey(input: string): string | null {
  const normalized = normalizePatientText(input);
  for (const { pattern, clarifyKey } of VAGUE_ONLY_PATTERNS) {
    if (pattern.test(normalized)) {
      return clarifyKey;
    }
  }
  if (normalized === "familie" || normalized === "familie?") {
    return "family";
  }
  return null;
}

const LAB_RESULT_TERMS =
  /\b(wert|werte|befund|befunde|ergebnis|resultat|laborwert|blutwert)\b/;

const LAB_QUESTION_MARKERS =
  /\b(was|wie|wissen|kennen|steht|sagen|zeigt|haben sie|ist mit|mit dem|mit der|mit ihrem|mit ihren)\b/;

/** Generic lab-result phrasing when STT drops ANA/Titer jargon (LiveAvatar). */
export function isDejargonizedLabResultQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  if (!LAB_RESULT_TERMS.test(normalized)) {
    return false;
  }
  if (
    /\b(schmerz|schmerzen|beschwerde|husten|ubelkeit|uebelkeit)\b/.test(normalized) &&
    !/\b(labor|blut|befund|ergebnis|resultat|wert|werte)\b/.test(normalized)
  ) {
    return false;
  }
  return normalized.includes("?") || LAB_QUESTION_MARKERS.test(normalized);
}

export function isRaynaudColorQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  if (/\braynaud\b/.test(normalized)) {
    return true;
  }
  if (/\b(kalte finger|finger bei kalt|finger bei kaelt)\b/.test(normalized)) {
    return true;
  }
  const hasFinger = /\b(finger|fingerkuppe)\b/.test(normalized);
  const hasColorCold =
    /\b(kalt|kalte|kälte|kaelt|weiss|weisse|blau|blasse|verfarb|verfaerb)\b/.test(
      normalized,
    );
  return hasFinger && hasColorCold;
}

export function getExaminerOnlyIntent(input: string): string | null {
  const normalized = normalizePatientText(input);
  const configured = loadPatientDialogueData().examinerOnlyBlocks.blocks;
  for (const block of configured) {
    if (matchesAnyAlias(input, block.aliases)) {
      return block.intent;
    }
  }
  if (isDejargonizedLabResultQuestion(input)) {
    return "laboratory";
  }
  // Imperfect lab STT is checked again before unknown; also catch early via patterns below.
  for (const { pattern, intent } of EXAMINER_ONLY_PATTERNS) {
    if (pattern.test(normalized)) {
      return intent;
    }
  }
  return null;
}

export function isJargonQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  return JARGON_TERMS.some((term) => normalized.includes(normalizePatientText(term)));
}

export function isLeadingQuestion(input: string): boolean {
  return LEADING_MARKERS.some((pattern) => pattern.test(input));
}

export function isBroadQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  return BROAD_PATTERNS.some((pattern) => pattern.test(normalized));
}

const CHIEF_COMPLAINT_OPENER_PATTERNS = [
  /\bwarum sind sie gekommen\b/,
  /\bwas fuhrt sie\b/,
  /\bwas fuehrt sie\b/,
  /\bwas ist ihr problem\b/,
  /\bwas problem\b/,
  /\bwarum hier\b/,
  /\bweshalb sind sie\b/,
  /\bwas bringt sie\b/,
];

export function isChiefComplaintOpenerQuestion(input: string): boolean {
  const normalized = normalizePatientText(input);
  if (CHIEF_COMPLAINT_OPENER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const opener = loadPatientDialogueData().universalIntents.intents.find(
    (intent) => intent.id === "chief_complaint.opener",
  );
  return Boolean(opener && matchesAnyAlias(input, opener.aliases));
}

export function inferBiographyIntent(input: string): string | null {
  const normalized = normalizePatientText(input);
  const aliasIntent = [
    ...loadPatientDialogueData().badGermanAliases.aliases,
    ...loadPatientDialogueData().sttNoiseAliases.aliases,
  ].find((alias) => {
    const aliasInput = normalizePatientText(alias.input);
    const aliasTokens = aliasInput.split(" ").filter(Boolean);
    return (
      normalized === aliasInput ||
      (aliasTokens.length > 1 && containsNormalizedTerm(normalized, aliasInput))
    );
  })
    ?.intent;

  if (aliasIntent?.startsWith("biography.")) {
    return aliasIntent;
  }

  if (
    /\b(vorname|vornamen)\b/.test(normalized) &&
    (/\bbuchstab/.test(normalized) || /\bbuch\s+stab/.test(normalized))
  ) {
    return "biography.given_name_spelling";
  }
  if (
    /\b(nachname|nachnamen)\b/.test(normalized) &&
    (/\bbuchstab/.test(normalized) || /\bbuch\s+stab/.test(normalized))
  ) {
    return "biography.family_name_spelling";
  }
  if (
    (/\bbuchstab/.test(normalized) || /\bbuch\s+stab/.test(normalized)) &&
    /\b(name|namen)\b/.test(normalized)
  ) {
    return "biography.full_name_spelling";
  }
  if (/\bbuchstab/.test(normalized) || /\bbuch\s+stab/.test(normalized)) {
    return "biography.full_name_spelling";
  }

  if (
    /\b(groesse|grosse|korpergrosse|koerpergroesse|wie gross|wie grosse|wie gross sind|körpergröße)\b/.test(
      normalized,
    ) ||
    /\bwie gross\b.*\bsie\b/.test(normalized)
  ) {
    return "biography.height";
  }

  if (
    /\b(fruher|frueher)\b/.test(normalized) &&
    /\b(gewicht|wiegen|kilo|wogen)\b/.test(normalized)
  ) {
    return "biography.weight_change";
  }
  if (
    /\b(gewicht|wie viel wiegen|wiegen sie|wie viel wiegst|was wiegen sie)\b/.test(
      normalized,
    )
  ) {
    return "biography.weight";
  }

  if (
    /\b(geburtsdatum|geboren|geburtstag|geb|wann sind sie geboren|wann geboren|datum der geburt|geboren datum)\b/.test(
      normalized,
    ) ||
    (/\bdatum\b/.test(normalized) && /\b(geburt|geboren)\b/.test(normalized))
  ) {
    return "biography.dob";
  }
  if (/\b(wie alt|alter|jahre alt)\b/.test(normalized)) {
    return "biography.age";
  }

  if (
    /\b(vorname|vornamen|nachname|nachnamen)\b/.test(normalized) &&
    !/\bbuchstab/.test(normalized)
  ) {
    return "biography.name";
  }

  if (
    /\b(wie heissen|wie heisen|wie heißen|wie heisst|wie heißt|ihr name|ihr nahme|name|nahme|nennen)\b/.test(
      normalized,
    ) ||
    /\bwhat is your name\b/.test(normalized) ||
    /\bnennen\b.*\b(sie|sich)\b/.test(normalized) ||
    /\bwer sind\b/.test(normalized) ||
    /^wie heis(s)?t\b/.test(normalized) ||
    /^wie nennen\b/.test(normalized)
  ) {
    return "biography.name";
  }
  if (/\b(beruf|beruflich|arbeiten sie|was machen sie beruflich)\b/.test(normalized)) {
    return "biography.occupation";
  }
  return null;
}

export function resolveUniversalDialogueIntent(input: string): {
  intent: string;
  responseDe: string;
  responseClass: "neutral_default" | "clarify" | "case_positive";
  matchedAliasId: string | null;
} | null {
  const normalized = normalizePatientText(input);
  const tokens = normalizedTokens(input);
  const data = loadPatientDialogueData();
  const intents = [...data.universalIntents.intents].sort(
    (a, b) => a.priority - b.priority,
  );

  for (const intent of intents) {
    const matchedAlias = matchesAnyAlias(input, intent.aliases);
    if (!matchedAlias) {
      continue;
    }
    if (intent.id === "smalltalk.greeting" && looksLikeMedicalFragment(tokens)) {
      continue;
    }
    if (intent.id === "chief_complaint.opener" && !isChiefComplaintOpenerQuestion(input)) {
      continue;
    }
    if (intent.answer_de) {
      return {
        intent: intent.id,
        responseDe: chooseSmallTalkResponse(intent.id, normalized, intent.answer_de),
        responseClass:
          intent.response_class === "clarify"
            ? "clarify"
            : intent.response_class === "case_positive"
              ? "case_positive"
              : "neutral_default",
        matchedAliasId: `${intent.id}:${normalizePatientText(matchedAlias)}`,
      };
    }
  }

  return null;
}

function looksLikeMedicalFragment(tokens: string[]): boolean {
  const contentTokens = tokens.filter(
    (token) => !["uh", "ah", "aeh", "eh", "hm", "also", "hi", "hallo"].includes(token),
  );
  return contentTokens.some((token) =>
    [
      "hatten",
      "haben",
      "fuhlen",
      "fuehlen",
      "nehmen",
      "wann",
      "wie",
      "was",
      "warum",
      "schmerz",
      "temperatur",
    ].includes(token),
  );
}

function chooseSmallTalkResponse(
  intent: string,
  normalized: string,
  fallback: string,
): string {
  if (intent === "smalltalk.greeting") {
    if (containsNormalizedTerm(normalized, "guten morgen")) {
      return "Guten Morgen.";
    }
    if (containsNormalizedTerm(normalized, "guten abend")) {
      return "Guten Abend.";
    }
    if (containsNormalizedTerm(normalized, "hallo")) {
      return "Hallo.";
    }
  }
  if (intent === "smalltalk.closing") {
    if (containsNormalizedTerm(normalized, "danke")) {
      return "Gern. Auf Wiedersehen.";
    }
    if (containsNormalizedTerm(normalized, "tschuss")) {
      return "Tschüss.";
    }
  }
  return fallback;
}

export function inferFamilyIntent(input: string): "history" | "status" | "ambiguous" {
  const normalized = normalizePatientText(input);
  if (
    /\b(familienanamnese|krankheiten in (?:der |ihrer )?familie|familie krank|rheuma|hashimoto|erblich|mutter|vater|tante)\b/.test(
      normalized,
    )
  ) {
    return "history";
  }
  if (
    /\b(verheiratet|zusammenleben|ehemann|tochter|kinder|wohnen sie|leben sie mit)\b/.test(
      normalized,
    )
  ) {
    return "status";
  }
  if (/^familie[?]?$/.test(normalized) || normalized === "familie") {
    return "ambiguous";
  }
  if (/\bfamilie\b/.test(normalized)) {
    return "history";
  }
  return "status";
}

export function inferSubstanceIntent(
  input: string,
): "medications" | "drugs" | "alcohol" | "ambiguous" | null {
  const normalized = normalizePatientText(input);
  if (/\b(drogen|cannabis|kokain|substanz)\b/.test(normalized)) {
    return "drugs";
  }
  if (/\b(alkohol|wein|bier)\b/.test(normalized)) {
    return "alcohol";
  }
  if (/\b(medikament|tablette|schmerzmittel|ibuprofen|regelmassig|regelmäßig)\b/.test(normalized)) {
    return "medications";
  }
  if (/^nehmen sie etwas[?]?$/.test(normalized)) {
    return "ambiguous";
  }
  if (/^trinken sie[?]?$/.test(normalized)) {
    return "ambiguous";
  }
  return null;
}
