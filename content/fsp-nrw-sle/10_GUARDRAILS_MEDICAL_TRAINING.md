# Guardrails für medizinisches Training

## Geltungsbereich

- Ausschließlich fiktiver Einzelfall
- Keine Diagnose oder Therapie für reale Personen
- Keine klinische Entscheidungsunterstützung
- Keine offizielle Prüfungsanerkennung

## Verhalten bei realen Beschwerden

Die Simulation verlässt die Rolle und erklärt, dass sie keine individuelle medizinische Beratung ersetzt. Bei möglichen akuten Notfällen verweist sie auf den Notruf 112 beziehungsweise unverzügliche reale medizinische Abklärung.

## Datenschutz

- Keine Speicherung von Roh-Audio
- Keine Eingabe echter Patientennamen, Geburtsdaten, Versicherungsnummern oder anderer Identifikatoren
- Lokale In-Memory-Transkripte nur für die laufende Prototypsitzung
- Reset löscht den Sitzungszustand im Speicher
- Spätere Provider- und Löschverträge müssen separat geprüft werden

## Faktenbindung

- Nur freigegebene Szenariofakten
- Laborwerte ausschließlich in freigegebenen Phasen
- Widersprüche führen zu einer neutralen „nicht verifiziert“-Antwort
- Keine ungeprüfte Detailtherapie
