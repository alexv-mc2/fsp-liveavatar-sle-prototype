import type { FspPhase } from "@/lib/clientTypes";
import { HeyGenAvatarShell } from "./HeyGenAvatarShell";
import { PushToTalkMock } from "./PushToTalkMock";

const patientPhases: FspPhase[] = [
  "patient_opening",
  "anamnesis_active",
  "patient_questions",
];

interface PatientSimulationPanelProps {
  phase: FspPhase;
  busy?: boolean;
  onSend: (text: string) => Promise<void> | void;
}

export function PatientSimulationPanel({
  phase,
  busy,
  onSend,
}: PatientSimulationPanelProps) {
  const chatEnabled = patientPhases.includes(phase) && phase !== "patient_opening";

  return (
    <section className="panel patient-panel" aria-labelledby="patient-panel-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Arzt-Patienten-Gespräch</p>
          <h2 id="patient-panel-title">Mock-Patientin</h2>
        </div>
        <span className="status-pill status-reconciled">RECONCILED_V1</span>
      </div>
      <HeyGenAvatarShell speaking={busy} />
      <PushToTalkMock disabled={!chatEnabled} busy={busy} onSend={onSend} />
      {!chatEnabled ? (
        <p className="panel-hint">
          {phase === "patient_opening"
            ? "Beginnen Sie die Anamnese über die Phasensteuerung."
            : "Die Patienteneingabe ist in dieser Phase pausiert."}
        </p>
      ) : null}
    </section>
  );
}
