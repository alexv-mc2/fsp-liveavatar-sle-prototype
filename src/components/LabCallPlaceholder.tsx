export function LabCallPlaceholder() {
  return (
    <section className="panel work-panel" aria-labelledby="lab-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Laboranruf · Text-Platzhalter</p>
          <h2 id="lab-title">Laborphase</h2>
        </div>
        <span className="status-pill status-unverified">UNVERIFIED_FROM_PDF</span>
      </div>
      <div className="notice notice-warning">
        Konkrete Laborwerte sind im Szenario ausschließlich als ungeprüfter PDF-Seed hinterlegt. Eine fachliche Interpretation wird vor DeepSearch und ärztlicher Prüfung nicht angeboten.
      </div>
      <p className="panel-hint">
        Der spätere Laboranruf soll Wiederholung kritischer Werte, Rückfragen und phasengebundene Freigaben prüfen.
      </p>
    </section>
  );
}
