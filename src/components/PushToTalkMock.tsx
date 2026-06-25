"use client";

import { FormEvent, useState } from "react";

interface PushToTalkMockProps {
  disabled?: boolean;
  busy?: boolean;
  onSend: (text: string) => Promise<void> | void;
}

export function PushToTalkMock({
  disabled = false,
  busy = false,
  onSend,
}: PushToTalkMockProps) {
  const [text, setText] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = text.trim();
    if (!next || disabled || busy) return;
    setText("");
    void onSend(next);
  }

  return (
    <form className="ptt-form" onSubmit={submit}>
      <label htmlFor="ptt-input">Frage an die Patientin</label>
      <textarea
        id="ptt-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Zum Beispiel: Seit wann bestehen die Beschwerden?"
        rows={3}
        disabled={disabled || busy}
      />
      <div className="ptt-actions">
        <span className="muted-copy">Text simuliert Push-to-Talk; kein Audio wird erfasst.</span>
        <button
          className="button button-primary"
          type="submit"
          disabled={disabled || busy || !text.trim()}
        >
          {busy ? "Verarbeitung …" : "PTT-Mock senden"}
        </button>
      </div>
    </form>
  );
}
