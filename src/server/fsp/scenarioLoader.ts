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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function loadScenario(filePath = DEFAULT_SCENARIO_PATH): SleScenario {
  if (filePath === DEFAULT_SCENARIO_PATH && cachedScenario) {
    return cachedScenario;
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = parse(raw);
  const scenario = deepFreeze(SleScenarioSchema.parse(parsed));

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
