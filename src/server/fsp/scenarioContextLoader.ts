import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedChatMessage } from "../integrations/customLlm/messageExtraction";
import { messageContentToText } from "../integrations/customLlm/messageExtraction";
import type { SleScenario } from "./types";

export const SCENARIO_CONTENT_DIR = path.join(
  process.cwd(),
  "content",
  "fsp-nrw-sle",
);

export const AUTHORITATIVE_SCENARIO_FILES = {
  systemPrompt: "00_SYSTEM_PROMPT_DE.md",
  patientRole: "03_PATIENT_ROLE_PROMPT_DE.md",
} as const;

export type PromptSource = "repo_content";

export type AuthoritativeScenarioContext = {
  scenarioId: "fsp-nrw-sle";
  promptSource: PromptSource;
  systemPromptDe: string;
  patientRolePromptDe: string;
  patientDisplayName: string;
  openingStatementDe: string;
  ignoredIncomingSystemMessages: number;
  scenarioContextLoaded: true;
};

let cachedSystemPromptDe: string | undefined;
let cachedPatientRolePromptDe: string | undefined;

function readScenarioMarkdown(relativePath: string): string {
  return readFileSync(path.join(SCENARIO_CONTENT_DIR, relativePath), "utf8");
}

/** Strip markdown headings/status banners; keep instructional prose for grounding. */
export function stripMarkdownForPrompt(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^\*\*Status:\*\*.*$/, "").trim())
    .filter((line) => line.length > 0 && line !== "---")
    .join("\n");
}

export function loadSystemPromptMarkdown(): string {
  if (!cachedSystemPromptDe) {
    cachedSystemPromptDe = stripMarkdownForPrompt(
      readScenarioMarkdown(AUTHORITATIVE_SCENARIO_FILES.systemPrompt),
    );
  }
  return cachedSystemPromptDe;
}

export function loadPatientRoleMarkdown(): string {
  if (!cachedPatientRolePromptDe) {
    cachedPatientRolePromptDe = stripMarkdownForPrompt(
      readScenarioMarkdown(AUTHORITATIVE_SCENARIO_FILES.patientRole),
    );
  }
  return cachedPatientRolePromptDe;
}

export function clearScenarioContextCacheForTests(): void {
  cachedSystemPromptDe = undefined;
  cachedPatientRolePromptDe = undefined;
}

export function countIgnoredIncomingSystemMessages(
  messages: ParsedChatMessage[],
): number {
  return messages.filter((message) => {
    const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
    return role === "system" || role === "developer";
  }).length;
}

export function buildAuthoritativeScenarioContext(
  scenario: SleScenario,
  messages: ParsedChatMessage[],
): AuthoritativeScenarioContext {
  const systemPromptDe = [
    loadSystemPromptMarkdown(),
    loadPatientRoleMarkdown(),
    `Patientin: ${scenario.patient.display_name}, ${scenario.patient.age_years} Jahre, ${scenario.patient.occupation_de}.`,
    `Eröffnung (kanonisch): ${scenario.opening.statement_de}`,
    `Fall-ID: ${scenario.metadata.id}. Inhaltsstatus: ${scenario.metadata.content_status}.`,
  ].join("\n\n");

  return {
    scenarioId: scenario.metadata.id,
    promptSource: "repo_content",
    systemPromptDe,
    patientRolePromptDe: loadPatientRoleMarkdown(),
    patientDisplayName: scenario.patient.display_name,
    openingStatementDe: scenario.opening.statement_de,
    ignoredIncomingSystemMessages: countIgnoredIncomingSystemMessages(messages),
    scenarioContextLoaded: true,
  };
}

/** Incoming LiveAvatar/HeyGen system messages are never authoritative for case facts. */
export function extractAuthoritativeUserText(
  messages: ParsedChatMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const role =
      typeof message.role === "string" ? message.role.toLowerCase() : "";
    if (role !== "user") {
      continue;
    }
    const text = messageContentToText(message.content).trim();
    return text.length > 0 ? text : null;
  }
  return null;
}
