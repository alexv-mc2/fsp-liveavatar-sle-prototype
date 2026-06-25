import type { SessionState, SleScenario } from "./types";

export interface TrainingFeedback {
  labelDe: string;
  disclaimerDe: string;
  checklist: {
    covered: string[];
    missing: string[];
    coveredCount: number;
    totalCount: number;
    coveragePercent: number;
  };
  hiddenFacts: {
    revealedCount: number;
    remainingCount: number;
  };
  safety: {
    flags: string[];
    requiresHumanReview: boolean;
  };
  humanReviewItemsDe: string[];
}

export function calculateTrainingFeedback(
  session: SessionState,
  scenario: SleScenario,
): TrainingFeedback {
  const expectedChecklist = [
    ...new Set(
      scenario.facts
        .map((fact) => fact.checklist_item)
        .filter((item): item is string => Boolean(item)),
    ),
  ];
  const covered = expectedChecklist.filter((item) =>
    session.askedChecklistItems.has(item),
  );
  const missing = expectedChecklist.filter(
    (item) => !session.askedChecklistItems.has(item),
  );
  const hiddenPatientFacts = scenario.facts.filter(
    (fact) => fact.visibility === "hidden",
  );
  const revealedHidden = hiddenPatientFacts.filter((fact) =>
    session.revealedFactIds.has(fact.id),
  );

  return {
    labelDe: "Interne Trainingsauswertung",
    disclaimerDe:
      "Keine offizielle ÄKNo-Bewertung und keine medizinische Zertifizierung.",
    checklist: {
      covered,
      missing,
      coveredCount: covered.length,
      totalCount: expectedChecklist.length,
      coveragePercent:
        expectedChecklist.length === 0
          ? 0
          : Math.round((covered.length / expectedChecklist.length) * 100),
    },
    hiddenFacts: {
      revealedCount: revealedHidden.length,
      remainingCount: hiddenPatientFacts.length - revealedHidden.length,
    },
    safety: {
      flags: [...session.safetyFlags],
      requiresHumanReview: session.safetyFlags.length > 0,
    },
    humanReviewItemsDe: [
      "Qualität der patientengerechten Sprache",
      "Medizinische Plausibilität nach DeepSearch",
      "Struktur der Dokumentation",
      "Qualität der Arzt-Arzt-Übergabe",
    ],
  };
}
