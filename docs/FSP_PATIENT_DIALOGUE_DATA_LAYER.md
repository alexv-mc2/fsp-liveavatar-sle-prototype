# FSP Patient Dialogue Data Layer

This document defines the data-driven patient dialogue layer for the HeyGen LiveAvatar FULL Mode FSP prototype.

## Sources

- Research/corpus/specification: `docs/research/FSP_Patient_Avatar_Universal_Dialogue_DeepSearch_DE.md`.
- Canonical SLE medical facts: `content/fsp-nrw-sle/02_CASE_SLE_SCENARIO.yaml`.
- Existing runtime contract: `/v1/chat/completions` remains OpenAI-compatible for streaming and non-streaming requests.

The DeepSearch file is used for architecture, intent taxonomy, bad-German/STT aliases, answer classes, LiveAvatar constraints, TTS/repeat policy, and regression-test inspiration. Its Frau Hartmann v0.1 case pack is not canonical medical truth.

## What Is Not Copied From DeepSearch v0.1

The DeepSearch draft values for demographics, Hausarzt, timeline, symptom positives/negatives, medications, allergies, labs, diagnosis, and treatment are not copied when they conflict with the repo case file. Canonical values such as Leonie Hartmann, date of birth, age, height, weight, Dr. Markus Schneider, Ibuprofen, Amoxicillin allergy, SLE-related positives, examiner-only labs, and classification details stay in `02_CASE_SLE_SCENARIO.yaml`.

The only canonical additions in this slice are explicit dialogue negatives for common wrong-path FSP questions: asthma, Zeckenbiss, and Herzrasen. They are marked `[INFERENCE][DIALOGUE-NEGATIVE]` and exist to avoid generic unknown responses for observable anamnesis negatives.

## Data Files

| File | Role |
| --- | --- |
| `content/fsp-dialogue/universal_intents.yaml` | Disease-agnostic high-priority intents such as greeting, closing, repeat, spelling/identity routing, and opener aliases. |
| `content/fsp-dialogue/patient_dialogue_policy.yaml` | Priority order, fallback policy, and TTS spelling policy. |
| `content/fsp-dialogue/fsp_bad_german_aliases.yaml` | Learner-German variants mapped to deterministic intents. |
| `content/fsp-dialogue/fsp_stt_noise_aliases.yaml` | LiveAvatar/STT noise variants mapped to deterministic intents. |
| `content/fsp-dialogue/examiner_only_blocks.yaml` | Diagnosis, lab, classification, and treatment blocks with patient-safe answers. |
| `content/fsp-nrw-sle/dialogue/frau_hartmann_dialogue_case_pack.yaml` | SLE-specific aliases and focused asked-only answer overrides mapped to canonical fact IDs. |
| `content/fsp-nrw-sle/dialogue/frau_hartmann_regression_matrix.yaml` | Regression cases derived from the corpus and observed LiveAvatar failures. |

## Code Mapping

`src/server/fsp/patientBehavior/dialogueData.ts` loads and validates the YAML files with Zod. `classifyQuestion.ts` uses universal intents and examiner-only blocks. `semanticIntent.ts` runs before fallback and scores normalized LiveAvatar/STT input by meaning: lowercased and umlaut-folded text, punctuation stripping, filler/polite phrase removal, STT alias expansion, word-order tolerant token matching, and semantic slots such as opener reason/arrival, fatigue, temperature, repeat, lab-value blocker, and hidden-diagnosis blocker. `factMatcher.ts` remains the canonical fact safety net and combines canonical `trigger_keywords` with case-pack aliases using whole-word matching to avoid collisions such as `bier` inside `buchstabieren` or `sehen` inside `Wiedersehen`. `focusedFactResponse.ts` renders short asked-only German answers from the case pack before falling back to canonical fact text.

The endpoint metadata under `x_fsp.patient_behavior` preserves the existing fields and adds optional `matched_fact_id`, `matched_alias_id`, `intent_score`, `match_strategy`, and `fallback_reason`.

## Why Direct Smoke Passed While LiveAvatar Failed

The earlier direct smoke used exact scripted phrases such as canonical opener and lab strings. Alex's LiveAvatar run exposed the real risk: STT clipped words, inserted filler words like `bitte`, `denn`, `heute`, changed word order, and produced learner-German fragments such as `Was Problem?`, `Anatita`, `Anathema`, `SLR`, or `Können Sie das bitte`. Exact alias matching could pass the smoke while the voice path still fell through to `Das weiß ich leider nicht.` The semantic scorer is intentionally tested with inserted filler words, clipped STT, wrong word order, `stream:true`, no `fsp_session_id`, and message-history repeat cases.

## Adding Future Cases

Add a new canonical scenario file first, then add a case-specific dialogue pack under `content/<case-id>/dialogue/`. The universal files should only change when a behavior is disease-agnostic. Future case packs should map aliases to canonical fact IDs instead of copying medical facts into code.

## LiveAvatar Readiness

The browser UI distinguishes FSP session readiness, LiveAvatar token/session start, SDK connection, and stream readiness. “Avatar bereit” is only shown when the SDK is connected and the video stream is ready; voice controls remain disabled before that.
