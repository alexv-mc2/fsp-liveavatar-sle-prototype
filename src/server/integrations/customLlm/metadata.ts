/** Metadata keys the Custom LLM handler may read. All other keys are ignored. */
export const CUSTOM_LLM_METADATA_ALLOWLIST = [
  "session_id",
  "fsp_phase",
  "case_id",
  "source",
] as const;

export type CustomLlmMetadataAllowlistKey =
  (typeof CUSTOM_LLM_METADATA_ALLOWLIST)[number];

export function partitionCustomLlmMetadata(
  metadata: Record<string, unknown> | undefined,
): {
  allowed: Partial<Record<CustomLlmMetadataAllowlistKey, unknown>>;
  ignoredKeys: string[];
} {
  if (!metadata) {
    return { allowed: {}, ignoredKeys: [] };
  }

  const allowed: Partial<Record<CustomLlmMetadataAllowlistKey, unknown>> = {};
  const ignoredKeys: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (
      (CUSTOM_LLM_METADATA_ALLOWLIST as readonly string[]).includes(key)
    ) {
      allowed[key as CustomLlmMetadataAllowlistKey] = value;
    } else {
      ignoredKeys.push(key);
    }
  }

  return { allowed, ignoredKeys };
}
