import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const DialogueIntentSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int(),
  response_class: z.string().min(1),
  answer_de: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).default([]),
});

const UniversalIntentsSchema = z.object({
  version: z.string().min(1),
  intents: z.array(DialogueIntentSchema).min(1),
});

const PatientDialoguePolicySchema = z.object({
  version: z.string().min(1),
  priority_order: z.array(z.string().min(1)).min(1),
  fallback_policy: z.object({
    ask_to_repeat_de: z.string().min(1),
    unknown_allowed_only_when: z.array(z.string().min(1)).default([]),
  }),
  tts: z.object({
    spelling_format: z.string().min(1),
    spelling_separator: z.string().min(1),
  }),
});

const AliasRuleSchema = z.object({
  id: z.string().min(1),
  input: z.string().min(1),
  intent: z.string().min(1),
  fact_id: z.string().min(1).optional(),
  response_class: z.string().min(1).optional(),
  provenance: z.string().min(1).optional(),
});

const AliasRulesSchema = z.object({
  version: z.string().min(1),
  aliases: z.array(AliasRuleSchema).default([]),
});

const ExaminerOnlyBlockSchema = z.object({
  id: z.string().min(1),
  intent: z.string().min(1),
  response_de: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
});

const ExaminerOnlyBlocksSchema = z.object({
  version: z.string().min(1),
  blocks: z.array(ExaminerOnlyBlockSchema).min(1),
});

const FocusedAnswerSchema = z.object({
  default_de: z.string().min(1),
  variants: z
    .array(
      z.object({
        when_any: z.array(z.string().min(1)).min(1),
        answer_de: z.string().min(1),
      }),
    )
    .default([]),
});

const DialogueCasePackSchema = z.object({
  version: z.string().min(1),
  case_id: z.literal("fsp-nrw-sle"),
  source_of_truth: z.string().min(1),
  fact_aliases: z.record(z.string(), z.array(z.string().min(1))).default({}),
  focused_answers: z.record(z.string(), FocusedAnswerSchema).default({}),
});

export type DialogueIntent = z.infer<typeof DialogueIntentSchema>;
export type AliasRule = z.infer<typeof AliasRuleSchema>;
export type ExaminerOnlyBlock = z.infer<typeof ExaminerOnlyBlockSchema>;
export type DialogueCasePack = z.infer<typeof DialogueCasePackSchema>;

export interface PatientDialogueData {
  universalIntents: z.infer<typeof UniversalIntentsSchema>;
  policy: z.infer<typeof PatientDialoguePolicySchema>;
  badGermanAliases: z.infer<typeof AliasRulesSchema>;
  sttNoiseAliases: z.infer<typeof AliasRulesSchema>;
  examinerOnlyBlocks: z.infer<typeof ExaminerOnlyBlocksSchema>;
  casePack: DialogueCasePack;
}

const CONTENT_ROOT = path.join(process.cwd(), "content");

const FILES = {
  universalIntents: path.join(CONTENT_ROOT, "fsp-dialogue", "universal_intents.yaml"),
  policy: path.join(CONTENT_ROOT, "fsp-dialogue", "patient_dialogue_policy.yaml"),
  badGermanAliases: path.join(CONTENT_ROOT, "fsp-dialogue", "fsp_bad_german_aliases.yaml"),
  sttNoiseAliases: path.join(CONTENT_ROOT, "fsp-dialogue", "fsp_stt_noise_aliases.yaml"),
  examinerOnlyBlocks: path.join(CONTENT_ROOT, "fsp-dialogue", "examiner_only_blocks.yaml"),
  casePack: path.join(
    CONTENT_ROOT,
    "fsp-nrw-sle",
    "dialogue",
    "frau_hartmann_dialogue_case_pack.yaml",
  ),
} as const;

let cachedDialogueData: PatientDialogueData | undefined;

function readYaml<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(filePath, "utf8");
  return schema.parse(parse(raw));
}

export function loadPatientDialogueData(): PatientDialogueData {
  if (cachedDialogueData) {
    return cachedDialogueData;
  }

  cachedDialogueData = {
    universalIntents: readYaml(FILES.universalIntents, UniversalIntentsSchema),
    policy: readYaml(FILES.policy, PatientDialoguePolicySchema),
    badGermanAliases: readYaml(FILES.badGermanAliases, AliasRulesSchema),
    sttNoiseAliases: readYaml(FILES.sttNoiseAliases, AliasRulesSchema),
    examinerOnlyBlocks: readYaml(FILES.examinerOnlyBlocks, ExaminerOnlyBlocksSchema),
    casePack: readYaml(FILES.casePack, DialogueCasePackSchema),
  };

  return cachedDialogueData;
}

export function clearPatientDialogueDataCacheForTests(): void {
  cachedDialogueData = undefined;
}
