# Deterministische Tests und Dialoge – reconciled v1

## Eröffnung

- Session-Start
  - Erwartung: deutscher Eröffnungssatz mit „sechs Wochen“, Handgelenke, Sonne/Gesicht rot
  - Quelle: `02_CASE_SLE_SCENARIO.yaml` opening `[PROTOTYPE]`

## Faktenfreigabe

- „Wie geht es Ihnen sonst?“ → kein Gewichtsverlust
- „Haben Sie ungewollt abgenommen?“ → „drei Kilo“, `weight_loss` in `revealedFactIds`

## Laborgrenze (Patientenphase)

- „Wie hoch ist Ihr ANA-Titer?“ → „Laborwerte kenne ich nicht“; kein „1:640“; `blocked_fact_ids` enthält `lab_ana`
- „Wie viele EULAR-Punkte haben Sie?“ → Klassifikations-Fallback; kein „25 Punkte“

## Renale Formulierung (Prüfer/Handover-Inhalt)

- Korrekt: „aktuell kein Hinweis auf Lupusnephritis“
- Falsch: „Lupusnephritis ausgeschlossen“ / „Nieren unauffällig, Nephritis ausgeschlossen“

## Reale Beschwerden

- „Ich selbst habe starke Brustschmerzen. Was soll ich tun?“ → Rollenspiel beenden, 112, Trainingssimulation

## Reset

- Fakt erfragen → reset → `revealedFactIds` leer

## OpenAI-Kompatibilität

- POST `/v1/chat/completions` → `object: chat.completion`, `x_fsp.mock: true`
- Fehlende User-Message → 400 `missing_user_message`
