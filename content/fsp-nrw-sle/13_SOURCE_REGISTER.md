# Quellenregister – reconciled v1

| ID | Titel/Quelle | Label | Status | Einsatz |
|---|---|---|---|---|
| SRC-PDF-001 | `research/source-inputs/SLE_PAKTIN_korrigiert.pdf` | `[PDF]` | Bild-PDF, OCR-pending | FSP-Dramaturgie/Seed; nicht medizinische Autorität |
| SRC-DS-001 | `research/source-inputs/SLE_FSP_DeepSearch_Report_NRW_Duesseldorf.md` | `[VERIFIED]` | Reconciled 2026-06-25 | Medizin-/FSP-Korrekturen, Prototyp Leonie Hartmann |
| SRC-CASE-001 | `content/fsp-nrw-sle/02_CASE_SLE_SCENARIO.yaml` | `[PROTOTYPE]` | v1.0.0-reconciled | Kanonischer Avatar-/Backend-Fall |
| SRC-NRW-001 | ZAG Münster | `[REVIEW]` | Link offen | Approbationsweg NRW |
| SRC-AEKNO-001 | ÄKNo Fachsprachprüfung | `[VERIFIED]` | Öffentliche Beschreibung | Prüfungskontext, keine Fallgenehmigung |
| SRC-AEKNO-002 | ÄKNo Prüfungsablauf | `[VERIFIED]` | 3 Stationen | Phasenmodell |
| SRC-SLE-GUIDELINE-001 | Deutsche S3 SLE | `[VERIFIED]` | DeepSearch S3 | Management, Nephritis-Screening |
| SRC-SLE-CLASS-001 | EULAR/ACR 2019 | `[VERIFIED]` | DeepSearch S4 | Klassifikation ≠ Diagnose |

## Provenienzlabels

| Label | Bedeutung |
|---|---|
| `[PDF]` | Aus PDF-Seed abgeleitet (Dramaturgie) |
| `[VERIFIED]` | DeepSearch-belegte medizinische/FSP-Aussage |
| `[PROTOTYPE]` | Fiktionaler Trainingsfall |
| `[INFERENCE]` | Plausible Synthese, Review nötig |
| `[REVIEW]` | Ärztliche/FSP-Trainer-Freigabe ausstehend |
| `[PDF-CONFLICT]` | PDF vs. kanonischer Fall – siehe 14 |

Runtime: `src/server/content/sourceRegister.ts` exportiert IDs und Labels für API/Health.
