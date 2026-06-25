# Vorlage Arzt-Arzt-Übergabe – Leonie Hartmann

**Status:** `[PROTOTYPE][REVIEW]`

## Struktur

1. Identifikation (Name, Alter, Vorstellungsgrund)
2. Leitsymptome und zeitlicher Verlauf
3. Relevante positive und negative Anamnese
4. Klinische und laborchemische Befunde (nur freigegebene Phase)
5. Beurteilung mit Unsicherheit: **dringender Verdacht**, nicht gesichert
6. Renaler Status: **aktuell kein Hinweis auf Lupusnephritis** `[VERIFIED]`
7. Differenzialdiagnosen
8. Plan, Dringlichkeit, Sicherheitsnetz

## Modellanfang

> „Frau Oberärztin, ich möchte Ihnen Frau Leonie Hartmann, 29 Jahre, vorstellen. Die bislang bis auf eine Appendektomie gesunde Patientin wurde wegen seit sechs Wochen bestehender symmetrischer Schmerzen und einer 60- bis 90-minütigen Morgensteifigkeit der MCP-, PIP- und Handgelenke zugewiesen …“

Vollständiges Modell: DeepSearch Report Abschnitt I2 / `research/source-inputs/SLE_FSP_DeepSearch_Report_NRW_Duesseldorf.md`

## Fehlermodi

| Fehler | Korrektur |
|---|---|
| „Die Patientin hat Lupus.“ | „Dringender Verdacht; Diagnose muss verifiziert werden.“ |
| Normale Kreatininwerte = Nephritis ausgeschlossen | Urin/UPCR/Sediment nennen; „aktuell kein Hinweis“ `[VERIFIED]` |
| ANA als Diagnosebeweis | Screeningmarker, nicht spezifisch genug `[VERIFIED]` |
| 31 EULAR-Punkte (Anti-Sm + Anti-dsDNA) | Nur 6 in Antikörperdomäne `[VERIFIED]` |
