export type GuardrailKind =
  | "real_medical_advice"
  | "possible_emergency"
  | "pii_warning"
  | "official_status"
  | "empty_input";

export interface GuardrailDecision {
  blocked: boolean;
  kind?: GuardrailKind;
  responseDe?: string;
}

const emergencyPattern =
  /\b(brustschmerz|atemnot|bewusstlos|lähmung|laehmung|schlaganfall|starke blutung|suizid|selbstmord|anaphylax)\w*/i;

const realUserPattern =
  /\b(ich selbst|bei mir|mein kind|meine mutter|mein vater|mein partner|eine echte patient|was soll ich (nehmen|tun)|diagnostiziere mich|behandle mich|ich habe seit|ich leide)\b/i;

const piiPattern =
  /\b(versichertennummer|krankenkassennummer|sozialversicherungsnummer|echter patientenname|vollständiger name|vollstaendiger name)\b/i;

const officialStatusPattern =
  /\b(offiziell.*(ärztekammer|aerztekammer|äkno|aekno)|genehmigt.*(ärztekammer|aerztekammer)|garantiert.*bestehen)\b/i;

export function evaluateGuardrails(input: string): GuardrailDecision {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      blocked: true,
      kind: "empty_input",
      responseDe: "Bitte formulieren Sie eine Frage für die Trainingssimulation.",
    };
  }

  if (realUserPattern.test(trimmed) && emergencyPattern.test(trimmed)) {
    return {
      blocked: true,
      kind: "possible_emergency",
      responseDe:
        "Das klingt nach einer Frage zu realen, möglicherweise akuten Beschwerden. Diese Trainingssimulation kann das nicht beurteilen. Bitte rufen Sie bei akuter Gefahr sofort 112 an oder lassen Sie sich unverzüglich medizinisch untersuchen.",
    };
  }

  if (realUserPattern.test(trimmed)) {
    return {
      blocked: true,
      kind: "real_medical_advice",
      responseDe:
        "Das betrifft reale Beschwerden. Diese fiktive Trainingssimulation ersetzt keine individuelle medizinische Beratung oder Diagnose. Bitte wenden Sie sich an eine Ärztin, einen Arzt oder den ärztlichen Bereitschaftsdienst; bei akuter Gefahr an 112.",
    };
  }

  if (piiPattern.test(trimmed)) {
    return {
      blocked: true,
      kind: "pii_warning",
      responseDe:
        "Bitte geben Sie in dieser Simulation keine echten Patientennamen, Geburtsdaten, Versicherungsnummern oder andere Identifikatoren ein.",
    };
  }

  if (officialStatusPattern.test(trimmed)) {
    return {
      blocked: true,
      kind: "official_status",
      responseDe:
        "Nein. Dies ist ein unabhängiger Trainingsprototyp und keine offiziell von der Ärztekammer Nordrhein genehmigte oder bewertete Prüfungssimulation.",
    };
  }

  return { blocked: false };
}
