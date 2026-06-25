import type { ClientTranscriptTurn } from "@/lib/clientTypes";

function roleLabel(role: ClientTranscriptTurn["role"]): string {
  if (role === "user") return "Arzt/Ärztin";
  if (role === "assistant") return "Patientin";
  return "System";
}

export function TranscriptPanel({ turns }: { turns: ClientTranscriptTurn[] }) {
  return (
    <section className="panel transcript-panel" aria-labelledby="transcript-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Lokaler Sitzungszustand</p>
          <h2 id="transcript-title">Transkript</h2>
        </div>
        <span className="status-pill">{turns.length} Einträge</span>
      </div>
      <div className="transcript-list" aria-live="polite">
        {turns.length === 0 ? (
          <p className="empty-state">Noch keine Einträge.</p>
        ) : (
          turns.map((turn) => (
            <article className={`transcript-turn transcript-${turn.role}`} key={turn.id}>
              <div className="transcript-meta">
                <strong>{roleLabel(turn.role)}</strong>
                <time dateTime={turn.timestamp}>
                  {new Date(turn.timestamp).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>{turn.content}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
