"use client";

import { useState } from "react";

export function HandoverForm() {
  const [handover, setHandover] = useState("");

  return (
    <section className="panel work-panel" aria-labelledby="handover-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Arzt-Arzt-Gespräch · Textmodus</p>
          <h2 id="handover-title">Strukturierte Übergabe</h2>
        </div>
        <span className="status-pill status-mock">Oberarzt-Mock</span>
      </div>
      <blockquote className="examiner-prompt">
        „Bitte stellen Sie mir die Patientin strukturiert vor und formulieren Sie Ihre Verdachtsdiagnose als Verdacht.“
      </blockquote>
      <label className="stacked-field">
        Ihre Übergabe
        <textarea
          value={handover}
          onChange={(event) => setHandover(event.target.value)}
          rows={9}
          placeholder="Ich möchte Ihnen Frau S., eine 58-jährige Patientin, vorstellen …"
        />
      </label>
      <p className="panel-hint">
        Sprachliche und medizinische Bewertung wartet auf den validierten Scoring- und Content-Layer.
      </p>
    </section>
  );
}
