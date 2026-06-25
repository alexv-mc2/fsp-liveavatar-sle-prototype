export function LabCallPlaceholder() {
  return (
    <section className="panel work-panel" aria-labelledby="lab-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Laboranruf · Text-Platzhalter</p>
          <h2 id="lab-title">Laborphase</h2>
        </div>
        <span className="status-pill status-reconciled">RECONCILED_V1</span>
      </div>
      <div className="notice notice-warning">
        Laborwerte sind fiktional und mit Provenienzlabels ([PROTOTYPE]/[VERIFIED]) im Szenario hinterlegt. Klassifikation ≠ Diagnose. Freigabe erst nach ärztlicher und FSP-Trainer-Prüfung.
      </div>
      <p className="panel-hint">
        In der Laborphase können ANA, Anti-dsDNA, Blutbild, Komplement und UPCR phasengebunden abgerufen werden. Renale Formulierung: aktuell kein Hinweis auf Lupusnephritis.
      </p>
    </section>
  );
}
