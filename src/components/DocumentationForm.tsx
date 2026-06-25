"use client";

import { useState } from "react";

export function DocumentationForm() {
  const [complaints, setComplaints] = useState("");
  const [history, setHistory] = useState("");
  const [assessment, setAssessment] = useState("");

  return (
    <section className="panel work-panel" aria-labelledby="documentation-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Text-Platzhalter</p>
          <h2 id="documentation-title">Dokumentation</h2>
        </div>
        <span className="status-pill status-mock">nicht bewertet</span>
      </div>
      <div className="form-grid">
        <label>
          Aktuelle Beschwerden und Verlauf
          <textarea value={complaints} onChange={(event) => setComplaints(event.target.value)} rows={4} />
        </label>
        <label>
          Relevante Anamnese
          <textarea value={history} onChange={(event) => setHistory(event.target.value)} rows={4} />
        </label>
        <label className="form-span">
          Verdachtsdiagnose, Differenzialdiagnosen und weiteres Vorgehen
          <textarea value={assessment} onChange={(event) => setAssessment(event.target.value)} rows={5} />
        </label>
      </div>
      <p className="panel-hint">
        Speicherung und inhaltliche Bewertung sind in diesem Slice bewusst nicht implementiert.
      </p>
    </section>
  );
}
