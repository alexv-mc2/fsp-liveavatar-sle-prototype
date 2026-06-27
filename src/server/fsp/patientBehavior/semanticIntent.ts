import { normalizePatientText } from "./normalize";

export type SemanticIntentKind =
  | "biography"
  | "chief_complaint_opener"
  | "diagnosis_block"
  | "fact"
  | "greeting"
  | "lab_block"
  | "medium_anamnesis"
  | "repeat";

export type SemanticIntentMatch = {
  kind: SemanticIntentKind;
  intent: string;
  score: number;
  matchStrategy: string;
  matchedAliasId: string | null;
  matchedFactId?: string;
  biographyIntent?: string;
  fallbackReason?: string;
};

type Candidate = SemanticIntentMatch & { priority: number };

const DROP_TOKENS = new Set([
  "aeh",
  "ah",
  "also",
  "am",
  "an",
  "bei",
  "bitte",
  "das",
  "den",
  "denn",
  "der",
  "die",
  "ein",
  "eine",
  "einem",
  "einen",
  "einer",
  "es",
  "heute",
  "hm",
  "ich",
  "ihnen",
  "ihr",
  "ihre",
  "ihrem",
  "ihren",
  "ihrer",
  "ist",
  "ja",
  "mal",
  "mir",
  "mit",
  "noch",
  "sehr",
  "sich",
  "sie",
  "sind",
  "uh",
  "uns",
  "war",
  "waren",
  "zu",
]);

const GREETING_TOKENS = new Set(["guten", "tag", "morgen", "abend", "hallo", "hi"]);

const MEDICAL_FRAGMENT_TOKENS = new Set([
  "beschwerde",
  "fieber",
  "haben",
  "hatten",
  "mude",
  "problem",
  "schmerz",
  "temperatur",
  "wann",
  "warum",
  "was",
  "wie",
]);

type SemanticProfile = {
  normalized: string;
  expanded: string;
  rawTokens: string[];
  tokens: string[];
  tokenSet: Set<string>;
};

function expandSttAliases(normalized: string): string {
  let expanded = normalized.replace(/-/g, " ");
  const replacements: Array<[RegExp, string]> = [
    [/\ba\s*1\s*titer\b/g, "ana titer"],
    [/\ba1\s*titer\b/g, "ana titer"],
    [/\bana\s*titer\b/g, "ana titer"],
    [/\banna\s*titer\b/g, "ana titer"],
    [/\banatiter\b/g, "ana titer"],
    [/\banatita\b/g, "ana titer"],
    [/\banathema\b/g, "ana titer"],
    [/\bmuedigkeit\b/g, "mudigkeit"],
    [/\bmued\b/g, "mude"],
    [/\berschoepft\b/g, "erschopft"],
    [/\berschoepfung\b/g, "erschopfung"],
    [/\bschwaeche\b/g, "schwache"],
    [/\berhoeht\b/g, "erhoht"],
    [/\berhohte\b/g, "erhohte"],
    [/\bfuehrt\b/g, "fuhrt"],
  ];

  for (const [pattern, replacement] of replacements) {
    expanded = expanded.replace(pattern, replacement);
  }

  return expanded.replace(/\?/g, " ").replace(/\s+/g, " ").trim();
}

function lemma(token: string): string {
  if (/^beschwerd/.test(token)) {
    return "beschwerde";
  }
  if (/^(komm|kommt|kommen|gekommen|gekomm)$/.test(token)) {
    return "kommen";
  }
  if (/^(fuhrt|fuhren|bringt|bringen)$/.test(token)) {
    return "fuehren";
  }
  if (/^(mude|mudigkeit|muedigkeit|fatigue)$/.test(token)) {
    return "fatigue";
  }
  if (/^(erschopft|erschopfung|schwach|schwache|kraftlos|kraft)$/.test(token)) {
    return "fatigue";
  }
  if (/^temperatur/.test(token)) {
    return "temperatur";
  }
  if (/^fieber/.test(token)) {
    return "fieber";
  }
  if (/^erhoh/.test(token)) {
    return "erhoeht";
  }
  if (/^buchstab/.test(token)) {
    return "buchstabieren";
  }
  if (/^vornam/.test(token)) {
    return "vorname";
  }
  if (/^nachnam/.test(token)) {
    return "nachname";
  }
  if (/^geburt/.test(token)) {
    return token.startsWith("geburtsdatum") ? "geburtsdatum" : "geburt";
  }
  if (token === "slr" || token === "sla") {
    return token;
  }
  return token;
}

export function buildSemanticProfile(input: string): SemanticProfile {
  const normalized = normalizePatientText(input);
  const expanded = expandSttAliases(normalized);
  const rawTokens = expanded.split(" ").filter(Boolean);
  const tokens = rawTokens.map(lemma).filter((token) => !DROP_TOKENS.has(token));
  return {
    normalized,
    expanded,
    rawTokens,
    tokens,
    tokenSet: new Set(tokens),
  };
}

function hasAny(profile: SemanticProfile, values: string[]): boolean {
  return values.some((value) => profile.tokenSet.has(value));
}

function hasMedicalContent(profile: SemanticProfile): boolean {
  return profile.rawTokens.map(lemma).some((token) => MEDICAL_FRAGMENT_TOKENS.has(token));
}

function candidate(
  value: Omit<Candidate, "matchedAliasId"> & { matchedAliasId?: string | null },
): Candidate {
  return {
    ...value,
    matchedAliasId: value.matchedAliasId ?? null,
  };
}

function scoreRepeat(profile: SemanticProfile): Candidate | null {
  const normalized = profile.normalized.replace(/-/g, " ");
  if (/\b(langsam|langsamer)\b/.test(normalized)) {
    return candidate({
      kind: "repeat",
      intent: "patient.repeat",
      score: 0.94,
      priority: 100,
      matchStrategy: "semantic_repeat_speed_request",
      matchedAliasId: "repeat.slower",
    });
  }
  if (/\bwiederholen\b/.test(normalized)) {
    return candidate({
      kind: "repeat",
      intent: "patient.repeat",
      score: 0.96,
      priority: 100,
      matchStrategy: "semantic_repeat_request",
      matchedAliasId: "repeat.wiederholen",
    });
  }
  if (/\b(noch einmal|nochmal)\b/.test(normalized)) {
    return candidate({
      kind: "repeat",
      intent: "patient.repeat",
      score: 0.94,
      priority: 100,
      matchStrategy: "semantic_repeat_request",
      matchedAliasId: "repeat.noch_einmal",
    });
  }
  if (/^(konnen|koennen) sie das bitte$/.test(normalized)) {
    return candidate({
      kind: "repeat",
      intent: "patient.repeat",
      score: 0.82,
      priority: 100,
      matchStrategy: "semantic_repeat_clipped_can_you_please",
      matchedAliasId: "repeat.clipped_can_you_please",
    });
  }
  return null;
}

function scoreGreeting(profile: SemanticProfile): Candidate | null {
  const normalized = profile.normalized;
  if (!profile.rawTokens.some((token) => GREETING_TOKENS.has(token))) {
    return null;
  }
  if (hasMedicalContent(profile)) {
    return null;
  }
  const contentTokens = profile.tokens.filter((token) => !["aeh", "eh"].includes(token));
  if (
    contentTokens.length > 0 &&
    contentTokens.every((token) => GREETING_TOKENS.has(token))
  ) {
    return candidate({
      kind: "greeting",
      intent: "smalltalk.greeting",
      score: normalized === "guten" ? 0.84 : 0.92,
      priority: 90,
      matchStrategy: "semantic_greeting_clip",
      matchedAliasId: "smalltalk.greeting",
    });
  }
  return null;
}

function scoreBiography(profile: SemanticProfile): Candidate | null {
  if (profile.tokenSet.has("buchstabieren")) {
    const biographyIntent = profile.tokenSet.has("vorname")
      ? "biography.given_name_spelling"
      : profile.tokenSet.has("nachname")
        ? "biography.family_name_spelling"
        : "biography.full_name_spelling";
    return candidate({
      kind: "biography",
      intent: biographyIntent,
      biographyIntent,
      score: 0.94,
      priority: 95,
      matchStrategy: "semantic_biography_spelling_context",
      matchedAliasId: biographyIntent,
    });
  }
  if (
    profile.tokenSet.has("geboren") ||
    profile.tokenSet.has("geburtsdatum") ||
    profile.tokenSet.has("geburt") ||
    /\bwann\b.*\bgeboren\b/.test(profile.normalized)
  ) {
    return candidate({
      kind: "biography",
      intent: "biography.dob",
      biographyIntent: "biography.dob",
      score: 0.95,
      priority: 95,
      matchStrategy: "semantic_biography_dob",
      matchedAliasId: "biography.dob",
    });
  }
  return null;
}

function scoreLabBlock(profile: SemanticProfile): Candidate | null {
  const hasLabToken = hasAny(profile, ["ana", "titer", "blutwert", "laborwert"]);
  const hasValueToken = profile.tokenSet.has("wert") || profile.tokenSet.has("werte");
  const feverContext = hasAny(profile, ["temperatur", "fieber"]);
  const painContext = hasAny(profile, ["schmerz", "beschwerde"]);
  const clippedHowHigh =
    /\bwie hoch ist (ihr|ihre|ihren|der|die)\b/.test(profile.normalized) &&
    !feverContext &&
    !painContext;

  if (hasLabToken || hasValueToken || clippedHowHigh) {
    return candidate({
      kind: "lab_block",
      intent: "laboratory",
      score: hasLabToken || hasValueToken ? 0.97 : 0.74,
      priority: 98,
      matchStrategy: hasLabToken
        ? "semantic_lab_stt_alias"
        : hasValueToken
          ? "semantic_lab_value_slot"
          : "semantic_lab_how_high_slot",
      matchedAliasId: "semantic.laboratory",
    });
  }
  return null;
}

function scoreDiagnosisBlock(profile: SemanticProfile): Candidate | null {
  if (hasAny(profile, ["sle", "slr", "sla", "lupus"])) {
    return candidate({
      kind: "diagnosis_block",
      intent: "diagnosis.hidden",
      score: 0.98,
      priority: 99,
      matchStrategy: "semantic_diagnosis_abbreviation_guard",
      matchedAliasId: "semantic.diagnosis_hidden",
    });
  }
  return null;
}

function scoreOpener(profile: SemanticProfile): Candidate | null {
  const asksReason = hasAny(profile, ["warum", "weshalb"]);
  const hasArrival = hasAny(profile, ["kommen", "hier"]);
  const hasWhat = profile.tokenSet.has("was") || profile.tokenSet.has("welche");
  const hasOpenerNoun = hasAny(profile, ["problem", "beschwerde", "los"]);
  const hasLeadVerb = profile.tokenSet.has("fuehren");
  const hasGenericWhatHave = /\bwas\s+haben\s+sie\b/.test(profile.normalized);

  if (
    (asksReason && hasArrival) ||
    (hasWhat && hasLeadVerb) ||
    (hasWhat && hasOpenerNoun) ||
    hasGenericWhatHave
  ) {
    return candidate({
      kind: "chief_complaint_opener",
      intent: "chief_complaint.opener",
      score: hasGenericWhatHave ? 0.86 : 0.94,
      priority: 80,
      matchStrategy: "semantic_slot_opener",
      matchedAliasId: "semantic.chief_complaint.opener",
    });
  }
  return null;
}

function scoreFact(profile: SemanticProfile): Candidate | null {
  if (profile.tokenSet.has("fatigue")) {
    return candidate({
      kind: "fact",
      intent: "chief_complaint",
      matchedFactId: "chief_fatigue",
      score: 0.95,
      priority: 75,
      matchStrategy: "semantic_slot_fatigue",
      matchedAliasId: "semantic.fact.chief_fatigue",
    });
  }
  if (hasAny(profile, ["temperatur", "fieber"])) {
    return candidate({
      kind: "fact",
      intent: "constitutional",
      matchedFactId: "intermittent_fever",
      score: 0.95,
      priority: 75,
      matchStrategy: "semantic_slot_temperature",
      matchedAliasId: "semantic.fact.intermittent_fever",
    });
  }
  return null;
}

function scoreMediumAnamnesis(profile: SemanticProfile): Candidate | null {
  if (profile.normalized.includes("sonst noch")) {
    return null;
  }
  if (
    hasAny(profile, ["beschwerde", "symptom"]) &&
    !hasAny(profile, [
      "seit",
      "wann",
      "welche",
      "was",
      "warum",
      "weshalb",
      "kommen",
      "fuehren",
    ])
  ) {
    return candidate({
      kind: "medium_anamnesis",
      intent: "anamnesis.clarify",
      score: 0.62,
      priority: 20,
      matchStrategy: "semantic_medium_anamnesis_slot",
      matchedAliasId: "semantic.medium_anamnesis",
      fallbackReason: "semantic_medium_confidence",
    });
  }
  return null;
}

export function scoreSemanticIntent(input: string): SemanticIntentMatch | null {
  const profile = buildSemanticProfile(input);
  const candidates = [
    scoreRepeat(profile),
    scoreDiagnosisBlock(profile),
    scoreLabBlock(profile),
    scoreBiography(profile),
    scoreGreeting(profile),
    scoreOpener(profile),
    scoreFact(profile),
    scoreMediumAnamnesis(profile),
  ].filter((entry): entry is Candidate => Boolean(entry));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score || b.priority - a.priority);
  const best = candidates[0];
  if (best.score < 0.6) {
    return null;
  }

  return {
    kind: best.kind,
    intent: best.intent,
    score: best.score,
    matchStrategy: best.matchStrategy,
    matchedAliasId: best.matchedAliasId,
    matchedFactId: best.matchedFactId,
    biographyIntent: best.biographyIntent,
    fallbackReason: best.fallbackReason,
  };
}
