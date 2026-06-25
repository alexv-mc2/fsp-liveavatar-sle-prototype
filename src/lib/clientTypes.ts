export type FspPhase =
  | "session_start"
  | "patient_opening"
  | "anamnesis_active"
  | "patient_questions"
  | "documentation_phase"
  | "lab_call_phase"
  | "doctor_handover_phase"
  | "feedback_phase"
  | "session_end";

export interface ClientTranscriptTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  phase: FspPhase;
  source: string;
  timestamp: string;
}

export interface ClientSession {
  id: string;
  caseId: "fsp-nrw-sle";
  phase: FspPhase;
  revealedFactIds: string[];
  askedChecklistItems: string[];
  transcriptTurns: ClientTranscriptTurn[];
  safetyFlags: string[];
  patientQuestionIndex: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface ClientTrainingFeedback {
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
