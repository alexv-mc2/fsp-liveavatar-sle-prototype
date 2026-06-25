import type { ClientTrainingFeedback } from "@/lib/clientTypes";

export function FeedbackReport({
  feedback,
}: {
  feedback: ClientTrainingFeedback | null;
}) {
  return (
    <section className="panel work-panel" aria-labelledby="feedback-title">
      <div className="panel-heading compact-heading">
        <div>
          <p className="section-kicker">Regelbasiert · v0</p>
          <h2 id="feedback-title">Feedback</h2>
        </div>
        <span className="status-pill status-unverified">kein Pass/Fail</span>
      </div>
      {!feedback ? (
        <p className="empty-state">Die Trainingsauswertung wurde noch nicht erzeugt.</p>
      ) : (
        <div className="feedback-grid">
          <div className="metric-card">
            <span>Checklistenabdeckung</span>
            <strong>{feedback.checklist.coveragePercent}%</strong>
            <small>
              {feedback.checklist.coveredCount} von {feedback.checklist.totalCount} Bereichen
            </small>
          </div>
          <div className="metric-card">
            <span>Freigegebene versteckte Fakten</span>
            <strong>{feedback.hiddenFacts.revealedCount}</strong>
            <small>{feedback.hiddenFacts.remainingCount} noch nicht erfragt</small>
          </div>
          <div className="feedback-list form-span">
            <h3>Erfordert Human Review</h3>
            <ul>
              {feedback.humanReviewItemsDe.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="notice form-span">{feedback.disclaimerDe}</div>
        </div>
      )}
    </section>
  );
}
