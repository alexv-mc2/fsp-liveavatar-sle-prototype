# Guardrails für medizinisches Training – reconciled v1

## Geltungsbereich

- Ausschließlich **ein** fiktiver SLE-Fall (Frau Leonie Hartmann)
- Keine Diagnose oder Therapie für reale Personen
- Keine klinische Entscheidungsunterstützung
- Keine offizielle ÄKNo-Prüfungsanerkennung

## Verhalten bei realen Beschwerden

Die Simulation verlässt die Rolle und erklärt, dass sie keine individuelle medizinische Beratung ersetzt. Bei möglichen akuten Notfällen: **112** / unverzügliche Abklärung.

## Faktenbindung

- Nur freigegebene Szenariofakten mit Provenienzlabels
- Laborwerte und EULAR/ACR-Punkte **nur** in freigegebenen Phasen
- Patientin kennt keine Antikörper, Komplement, UPCR oder Klassifikation
- Renale Formulierung: „aktuell kein Hinweis auf Lupusnephritis“ – nicht „ausgeschlossen“ `[VERIFIED]`
- Klassifikation ≠ Diagnose `[VERIFIED]`

## Provenienz

Alle reviewed/unsichere Inhalte tragen `[PDF]`, `[VERIFIED]`, `[PROTOTYPE]`, `[INFERENCE]` oder `[REVIEW]` in Szenario und Quellenregister.

## Datenschutz

- Keine echten Patientendaten
- In-Memory-Transkripte; Reset löscht `revealedFactIds`
