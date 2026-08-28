# Simulated Patient Behavior Policy

This document describes the **reusable, disease-agnostic patient behavior layer** used by the FSP Custom LLM mock. The SLE case (Frau Leonie Hartmann) is the first consumer; future cases swap the YAML fact pack while keeping the same engine.

**Source spec:** [FSP_Simulated_Patient_Behavior_DeepSearch_DE.md](./research/FSP_Simulated_Patient_Behavior_DeepSearch_DE.md) (DeepSearch-derived architecture, 2026-06-26). Medical truth for the SLE prototype always comes from the repo canonical case file [`content/fsp-nrw-sle/02_CASE_SLE_SCENARIO.yaml`](../content/fsp-nrw-sle/02_CASE_SLE_SCENARIO.yaml), not from illustrative examples in the research doc.

## Architecture

```
Question → classifyQuestion → resolvePatientResponse → response + metadata
                ↓                        ↓
         questionQuality[]          factMatcher (YAML facts)
                                   scenario.patient (biography)
```

### Knowledge separation

| Layer | Patient may answer | Blocked in anamnesis |
|-------|-------------------|----------------------|
| `patient_known` | Subjective symptoms, biography, meds, allergies, social/family history, patient concerns | — |
| `examiner_only` | — | Labs (ANA, anti-dsDNA, complement), EULAR/ACR score, working diagnosis, examiner physical findings, treatment recommendations |

### Response classes

| Class | When used |
|-------|-----------|
| `case_positive` | Matched hidden/opening fact supports the canonical case |
| `case_negative` | Matched fact is a stable negative (e.g. no Raynaud, no oral ulcers) |
| `neutral_default` | Biography, stress/concerns, normal social facts |
| `clarify` | Vague one-word questions (`Familie?`, `Nehmen Sie etwas?`, `Trinken Sie?`) or jargon without lay context |
| `patient_unknown` | No matching fact; fallback `unknown_de` — only for realistically unknowable items |
| `examiner_only_block` | Diagnosis, classification, labs, examiner-only YAML facts during patient phase |

### Question handling

- **Broad** (`Was führt Sie …?`, `Sonst noch Beschwerden?`): opening statement or up to two unrevealed salient facts; no diagnosis leakage.
- **Vague**: clarification template before answering.
- **Leading** (`Sie haben doch sicher …`): prefer truthful negative fact if matched; do not adopt the premise.
- **Jargon** (e.g. arthralgie, dyspnoe): ask for simpler wording unless lay terms also appear.
- **Wrong-path**: answer with canonical negatives from the fact pack; do not invent new symptoms.
- **Anti-misdirection**: token blocklists and intent routing (e.g. `drogen` → `drugs_none`, not ibuprofen; `familienanamnese` → `family_history`, not `family_status`).

### API surface

Non-streaming and `stream:true` responses expose behavior metadata under `x_fsp.patient_behavior`:

```json
{
  "response_class": "case_positive",
  "intent": "musculoskeletal",
  "question_quality": ["specific"]
}
```

## Implementation

| Module | Role |
|--------|------|
| `src/server/fsp/patientBehavior/resolvePatientResponse.ts` | Main resolver |
| `src/server/fsp/patientBehavior/classifyQuestion.ts` | Intent + question quality |
| `src/server/fsp/patientBehavior/factMatcher.ts` | Scored YAML fact matching |
| `src/server/fsp/patientBehavior/normalize.ts` | German text normalization |
| `src/server/fsp/hiddenFactPolicy.ts` | Thin wrapper (legacy entry point) |

## Case pack requirements

Each scenario YAML should define:

1. `patient` block — stable biography (name, age, occupation, family context).
2. `facts[]` — positives, negatives, social history, with `visibility: hidden | examiner_only`.
3. `fallbacks` — including `unknown_de`, `lab_in_patient_phase_de`, `classification_in_patient_phase_de`, `examiner_only_de`.

## Tests

See `tests/patient-behavior.test.ts` for stream/non-stream coverage, HeyGen-style requests without `fsp_session_id`, SLE-path questions, broad/vague/jargon/leading/wrong-path cases, examiner blocks, and collision guards.
