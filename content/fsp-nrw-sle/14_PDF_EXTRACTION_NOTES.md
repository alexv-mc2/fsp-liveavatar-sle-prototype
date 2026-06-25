# PDF-Extraktionsnotizen – SLE PAKTIN korrigiert

**Datei:** `research/source-inputs/SLE_PAKTIN_korrigiert.pdf` (44 Seiten, ~55 MB)  
**Extraktionsstatus:** `[PDF]` – **kein maschinenlesbarer Text** (Bild-/Folien-PDF); pypdf lieferte 0 Zeichen pro Seite. Visuelle Seitenprüfung/OCR ausstehend `[REVIEW]`.

**DeepSearch-Report:** Erstellt, als PDF noch nicht zugänglich; jetzt mit PDF im Repo abgleichbar.

---

## B1. Aus vorherigem PDF-Seed (Handoff/YAML v0.1) – `[PDF][INFERENCE]`

| Element | PDF-Seed (provisorisch) |
|---|---|
| Name | Frau S. (unsichere Schreibweise) |
| Alter | 58 Jahre |
| Beruf | Sozialpädagogin an Grundschule |
| Familie | verheiratet, zwei Kinder |
| Eröffnung | „Ich bin ständig müde und meine Gelenke tun immer wieder weh.“ |
| Gelenke | Hände und Knie, beidseitig, schubweise |
| Haut | Rötung Wangen/Nase, photosensibel |
| Konstitution | Fieber, Nachtschweiß, ~3 kg Gewichtsverlust |
| Medikation | Diclofenac + Pantoprazol |
| Allergien | keine bekannt |
| Familienanamnese | Mutter rheumatisch; Schwester Hautkrankheit (Widerspruch RA vs. Arthrose) |
| Labor (Seed) | ANA 1:640, Anti-dsDNA+, Hb 10,8, Lk 3,2, Thrombo 120/nl |

## B2. Dramaturgie-Struktur aus PDF-Kontext (nicht medizinisch verifiziert)

- Station 1: Arzt-Patienten-Gespräch mit schrittweiser Anamnese
- Station 2: Dokumentation
- Station 3: Arzt-Arzt-Gespräch + ggf. Zusatzdokumente/Labor
- Patientenfragen am Ende (z. B. „Ist das schlimm?“)
- Laborrückruf / Befundbesprechung als Trainingselement
- Kommissions-/Wissensfragen zu SLE

## C. PDF vs. DeepSearch – `[PDF-CONFLICT]`

| Thema | PDF-Seed | Kanonischer Fall v1 | Entscheidung |
|---|---|---|---|
| Alter | 58 | 29 (Leonie Hartmann) | `[PROTOTYPE]` – epidemiologisch plausibler für SLE-Erstmanifestation |
| Name | Frau S. | Leonie Hartmann | `[PROTOTYPE]` |
| Beruf | Sozialpädagogin | Grundschullehrerin | `[PROTOTYPE]` – nah an PDF-Kontext (Schule) |
| Kinder | zwei | eine Tochter (3 J.) | `[PROTOTYPE]` |
| Eröffnung | kurz Müdigkeit/Gelenke | 6-Wochen-Hand/UV-Eröffnung | `[PROTOTYPE]` – reichere FSP-Dramaturgie |
| Medikation | Diclofenac + Pantoprazol | Ibuprofen 400 mg PRN | `[PROTOTYPE][REVIEW]` |
| Allergie | keine | Amoxicillin-Exanthem | `[PROTOTYPE]` |
| Thrombozyten | 120/nl | 168 G/l | `[PROTOTYPE]` – DeepSearch-Set |
| Diagnoseframe | unklar/gesichert? | dringender Verdacht, nicht gesichert | `[VERIFIED]` |
| Nephritis | oft implizit „normal = ok“ | aktuell kein Hinweis; Screening weiter nötig | `[VERIFIED]` |

## D. Kanonische Entscheidung

**Ein** verbesserter dritter Fall: PDF-Dramaturgie (Stationen, schrittweise Enthüllung, Patientenfragen) + DeepSearch-Medizin-/FSP-Korrekturen. Nicht blind PDF ersetzen, nicht DeepSearch ohne PDF-Struktur.

## E. Offene Punkte `[REVIEW]`

- Visuelle PDF-OCR mit Seitennummern und verbatim-Zitaten
- Dermatologische Attribution malarisches Erythem vs. Rosacea
- Disposition ambulant vs. stationär (fallbezogen)
- Ibuprofen-/NSAID-Empfehlung im Patientengespräch
- Offizielle ÄKNo-Dokumentationsformular-Felder exakt abgleichen
- Physician + FSP-Trainer Sign-off vor Produktionsfreigabe

## F. Nicht übernehmen ohne Review

- Klassifikation als Diagnose
- „Lupusnephritis ausgeschlossen“ bei normaler Kreatinin
- Patient kennt ANA/EULAR-Punkte früh
- Konkrete Therapiedosierung aus Simulation
- Behauptung offizieller ÄKNo-Fallgenehmigung
