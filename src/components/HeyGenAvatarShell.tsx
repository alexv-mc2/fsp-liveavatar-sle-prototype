interface HeyGenAvatarShellProps {
  speaking?: boolean;
}

export function HeyGenAvatarShell({ speaking = false }: HeyGenAvatarShellProps) {
  // TODO(HEYGEN_FULL_MODE): Request the LiveAvatar session token from our backend.
  // TODO(HEYGEN_FULL_MODE): Start the FULL Mode session without exposing provider credentials.
  // TODO(HEYGEN_FULL_MODE): Wire real Push-to-Talk controls and interruption semantics.
  // TODO(HEYGEN_FULL_MODE): Reconcile LiveAvatar transcript/session events with server state.
  // TODO(HEYGEN_FULL_MODE): Stop the provider session on completion/reset/unmount.
  // TODO(HEYGEN_FULL_MODE): Test and invoke session-event deletion under the final privacy contract.
  return (
    <div className={`avatar-shell ${speaking ? "avatar-speaking" : ""}`}>
      <div className="avatar-status-row">
        <span className="status-pill status-mock">Mock Avatar</span>
        <span className="muted-copy">HeyGen FULL Mode: nicht verbunden</span>
      </div>
      <div className="avatar-portrait" role="img" aria-label="Platzhalter für die fiktive Patientin Frau S.">
        <div className="avatar-halo" />
        <div className="avatar-initials">FS</div>
      </div>
      <div className="avatar-caption">
        <strong>Frau S.</strong>
        <span>fiktive Patientin · Falldaten unverified</span>
      </div>
    </div>
  );
}
