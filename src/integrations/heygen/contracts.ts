/**
 * Provider-neutral boundary for the later HeyGen LiveAvatar FULL Mode spike.
 * The concrete request/event fields must be replaced with the verified provider
 * contract before implementation; no credentials or undocumented assumptions
 * belong in this interface.
 */
export interface LiveAvatarSessionDescriptor {
  providerSessionId: string;
  fspSessionId: string;
}

export type LiveAvatarEvent =
  | { type: "transcript.partial"; text: string; providerEventId?: string }
  | { type: "transcript.final"; text: string; providerEventId?: string }
  | { type: "avatar.started_speaking" }
  | { type: "avatar.stopped_speaking" }
  | { type: "session.closed"; reason?: string }
  | { type: "session.error"; message: string };

export interface HeyGenLiveAvatarAdapter {
  createSessionToken(fspSessionId: string): Promise<string>;
  startFullModeSession(
    token: string,
    fspSessionId: string,
  ): Promise<LiveAvatarSessionDescriptor>;
  startPushToTalk(): Promise<void>;
  stopPushToTalk(): Promise<void>;
  subscribe(listener: (event: LiveAvatarEvent) => void): () => void;
  stopSession(): Promise<void>;
  deleteSessionEvents(providerSessionId: string): Promise<void>;
}
