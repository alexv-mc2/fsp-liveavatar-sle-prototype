import type { FspPhase } from "@/lib/clientTypes";

const visiblePhases: Array<{ id: FspPhase; label: string }> = [
  { id: "patient_opening", label: "Eröffnung" },
  { id: "anamnesis_active", label: "Anamnese" },
  { id: "patient_questions", label: "Patientenfragen" },
  { id: "documentation_phase", label: "Dokumentation" },
  { id: "lab_call_phase", label: "Labor" },
  { id: "doctor_handover_phase", label: "Übergabe" },
  { id: "feedback_phase", label: "Feedback" },
];

export function PhaseIndicator({ phase }: { phase: FspPhase }) {
  const currentIndex = visiblePhases.findIndex((entry) => entry.id === phase);

  return (
    <ol className="phase-indicator" aria-label="Simulationsphasen">
      {visiblePhases.map((entry, index) => {
        const status =
          index === currentIndex ? "current" : index < currentIndex ? "complete" : "future";
        return (
          <li className={`phase-step phase-${status}`} key={entry.id}>
            <span className="phase-dot" aria-hidden="true" />
            <span>{entry.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
