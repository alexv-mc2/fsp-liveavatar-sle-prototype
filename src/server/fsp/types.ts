import { z } from "zod";

export const FSP_PHASES = [
  "session_start",
  "patient_opening",
  "anamnesis_active",
  "patient_questions",
  "documentation_phase",
  "lab_call_phase",
  "doctor_handover_phase",
  "feedback_phase",
  "session_end",
] as const;

export const FspPhaseSchema = z.enum(FSP_PHASES);
export type FspPhase = z.infer<typeof FspPhaseSchema>;

export const ScenarioFactSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  visibility: z.enum(["opening", "hidden", "examiner_only"]),
  allowed_phases: z.array(FspPhaseSchema).min(1),
  trigger_keywords: z.array(z.string()).default([]),
  answer_de: z.string().min(1),
  checklist_item: z.string().optional(),
  source_status: z.string().min(1),
});

export type ScenarioFact = z.infer<typeof ScenarioFactSchema>;

export const SleScenarioSchema = z.object({
  metadata: z.object({
    id: z.literal("fsp-nrw-sle"),
    version: z.string().min(1),
    title_de: z.string().min(1),
    content_status: z.enum(["UNVERIFIED_FROM_PDF", "RECONCILED_V1"]),
    medical_verification: z.string().min(1),
    official_approval: z.literal(false),
    jurisdiction_label_de: z.string().min(1),
    source_seed: z.string().min(1),
  }),
  patient: z.object({
    display_name: z.string().min(1),
    given_name: z.string().min(1),
    family_name: z.string().min(1),
    given_name_spelling_de: z.string().min(1),
    family_name_spelling_de: z.string().min(1),
    date_of_birth: z.string().min(1),
    date_of_birth_spoken_de: z.string().min(1),
    sex_de: z.string().min(1),
    age_years: z.number().int().positive(),
    height_spoken_de: z.string().min(1),
    weight_current_spoken_de: z.string().min(1),
    weight_previous_spoken_de: z.string().min(1),
    gp_name_de: z.string().min(1),
    gp_practice_de: z.string().min(1),
    occupation_de: z.string().min(1),
    family_status_de: z.string().min(1),
    emotional_state_de: z.string().min(1),
    language_style_de: z.string().min(1),
    source_status: z.string().min(1),
  }),
  opening: z.object({
    statement_de: z.string().min(1),
    source_status: z.string().min(1),
  }),
  facts: z.array(ScenarioFactSchema).min(1),
  fallbacks: z.object({
    unknown_de: z.string().min(1),
    unrelated_de: z.string().min(1),
    lab_in_patient_phase_de: z.string().min(1),
    classification_in_patient_phase_de: z.string().min(1).optional(),
    examiner_only_de: z.string().min(1),
    non_patient_phase_de: z.string().min(1),
  }),
  patient_questions: z.array(z.string().min(1)).min(1),
  forbidden_patient_behaviors: z.array(z.string().min(1)).min(1),
});

export type SleScenario = z.infer<typeof SleScenarioSchema>;

export type TranscriptRole = "user" | "assistant" | "system";
export type TranscriptSource =
  | "opening"
  | "text_mock"
  | "guardrail"
  | "phase_machine"
  | "feedback";

export interface TranscriptTurn {
  id: string;
  role: TranscriptRole;
  content: string;
  phase: FspPhase;
  source: TranscriptSource;
  timestamp: string;
}

export interface FactRevealEvent {
  factId: string;
  matchedKeyword: string;
  phase: FspPhase;
  timestamp: string;
}

export interface SessionState {
  id: string;
  caseId: "fsp-nrw-sle";
  phase: FspPhase;
  revealedFactIds: Set<string>;
  askedChecklistItems: Set<string>;
  transcriptTurns: TranscriptTurn[];
  factRevealEvents: FactRevealEvent[];
  safetyFlags: string[];
  patientQuestionIndex: number;
  lastPatientResponseDe: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface SerializedSessionState {
  id: string;
  caseId: "fsp-nrw-sle";
  phase: FspPhase;
  revealedFactIds: string[];
  askedChecklistItems: string[];
  transcriptTurns: TranscriptTurn[];
  factRevealEvents: FactRevealEvent[];
  safetyFlags: string[];
  patientQuestionIndex: number;
  lastPatientResponseDe: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
}
