import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { SleScenarioSchema, type SleScenario } from "./types";

export const DEFAULT_SCENARIO_PATH = path.join(
  process.cwd(),
  "content",
  "fsp-nrw-sle",
  "02_CASE_SLE_SCENARIO.yaml",
);

let cachedScenario: SleScenario | undefined;

export function loadScenario(filePath = DEFAULT_SCENARIO_PATH): SleScenario {
  if (filePath === DEFAULT_SCENARIO_PATH && cachedScenario) {
    return cachedScenario;
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = parse(raw);
  const scenario = SleScenarioSchema.parse(parsed);

  const factIds = new Set<string>();
  for (const fact of scenario.facts) {
    if (factIds.has(fact.id)) {
      throw new Error(`Duplicate scenario fact id: ${fact.id}`);
    }
    factIds.add(fact.id);
  }

  if (filePath === DEFAULT_SCENARIO_PATH) {
    cachedScenario = scenario;
  }

  return scenario;
}

export function clearScenarioCacheForTests(): void {
  cachedScenario = undefined;
}
