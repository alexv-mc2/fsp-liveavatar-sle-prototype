"use client";

import { useState } from "react";

interface DisclaimerConsentProps {
  onConfirm: () => Promise<void> | void;
  busy?: boolean;
  error?: string | null;
}

export function DisclaimerConsent({
  onConfirm,
  busy = false,
  error,
}: DisclaimerConsentProps) {
  const [trainingConfirmed, setTrainingConfirmed] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);

  const canStart = trainingConfirmed && privacyConfirmed && !busy;

  return (
    <main className="consent-shell">
      <section className="consent-card" aria-labelledby="consent-title">
        <div className="eyebrow">Vor dem Start</div>
        <h1 id="consent-title">Hinweise und Einwilligung</h1>
        <div className="consent-copy">
          <p>
            Diese Anwendung simuliert einen fiktiven Trainingsfall. Sie ist keine
            medizinische Beratung, keine klinische Entscheidungsunterstützung und
            keine offizielle Prüfung der Ärztekammer Nordrhein.
          </p>
          <p>
            Verwenden Sie keine echten Patientennamen, Geburtsdaten,
            Versicherungsnummern oder sonstigen Identifikatoren. Der Prototyp
            speichert kein Roh-Audio; die Texteingaben liegen nur im lokalen
            In-Memory-Sitzungszustand.
          </p>
          <p>
            Der spätere Mikrofon- und HeyGen-Datenfluss ist noch nicht aktiviert und
            benötigt vor einer realen Integration eine gesonderte Datenschutz- und
            Löschprüfung.
          </p>
        </div>

        <label className="consent-check">
          <input
            type="checkbox"
            checked={trainingConfirmed}
            onChange={(event) => setTrainingConfirmed(event.target.checked)}
          />
          <span>
            Ich verstehe, dass dies ein unabhängiger, medizinisch noch nicht final
            verifizierter Trainingsprototyp ist.
          </span>
        </label>

        <label className="consent-check">
          <input
            type="checkbox"
            checked={privacyConfirmed}
            onChange={(event) => setPrivacyConfirmed(event.target.checked)}
          />
          <span>Ich verwende ausschließlich fiktive Angaben und keine realen Patientendaten.</span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button
          className="button button-primary button-large"
          type="button"
          disabled={!canStart}
          onClick={() => void onConfirm()}
        >
          {busy ? "Sitzung wird angelegt …" : "Simulation starten"}
        </button>
      </section>
    </main>
  );
}
