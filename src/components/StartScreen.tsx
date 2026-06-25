import Link from "next/link";

export function StartScreen() {
  return (
    <main className="landing-shell">
      <section className="landing-card" aria-labelledby="page-title">
        <div className="eyebrow">FSP SLE Trainer · technischer Prototyp</div>
        <h1 id="page-title">Deutschsprachige Anamnese mit einer fiktiven SLE-Patientin</h1>
        <p className="landing-lead">
          Ein eigenständiger Einzelfall-Prototyp für den NRW-/Düsseldorf-Kontext der
          Fachsprachprüfung. Die medizinischen Falldaten sind noch nicht final
          verifiziert.
        </p>
        <div className="landing-facts" aria-label="Prototypumfang">
          <div>
            <span>Fall</span>
            <strong>Systemischer Lupus erythematodes</strong>
          </div>
          <div>
            <span>Interaktion</span>
            <strong>Textbasierter Push-to-Talk-Mock</strong>
          </div>
          <div>
            <span>Avatar</span>
            <strong>HeyGen-Schnittstelle vorbereitet, nicht verbunden</strong>
          </div>
        </div>
        <div className="notice notice-warning">
          Unabhängiges Training. Keine offizielle Genehmigung oder Bewertung durch
          die Ärztekammer Nordrhein. Keine medizinische Beratung.
        </div>
        <Link className="button button-primary button-large" href="/simulation">
          Zur Einwilligung und Simulation
        </Link>
      </section>
    </main>
  );
}
