import type { LiveAvatarSession, VoiceChat } from "@heygen/liveavatar-web-sdk";

type LiveKitRoomLike = {
  localParticipant?: {
    audioTrackPublications?: Map<
      string,
      { track?: { mediaStreamTrack?: MediaStreamTrack } }
    >;
  };
};

export type VoiceChatSnapshot = {
  state: string;
  isMuted: boolean;
  interactivityMode: string | null;
};

export type MediaTrackSnapshot = {
  readyState: MediaStreamTrackState;
  enabled: boolean;
  muted: boolean;
  labelPrefix: string;
};

export type OutboundAudioRtpSnapshot = {
  packetsSent: number;
  bytesSent: number;
  trackIdentifier?: string;
};

function readInteractivityMode(voiceChat: VoiceChat): string | null {
  const mode = (voiceChat as unknown as { mode?: string | null }).mode;
  return mode ?? null;
}

function readLiveKitRoom(session: LiveAvatarSession): LiveKitRoomLike | null {
  return (session as unknown as { room?: LiveKitRoomLike }).room ?? null;
}

export function snapshotVoiceChat(voiceChat: VoiceChat): VoiceChatSnapshot {
  return {
    state: String(voiceChat.state),
    isMuted: voiceChat.isMuted,
    interactivityMode: readInteractivityMode(voiceChat),
  };
}

export function snapshotLocalAudioTrack(
  session: LiveAvatarSession,
): MediaTrackSnapshot | null {
  const voiceTrack = (session.voiceChat as unknown as {
    track?: { mediaStreamTrack?: MediaStreamTrack };
  }).track?.mediaStreamTrack;

  if (voiceTrack) {
    return {
      readyState: voiceTrack.readyState,
      enabled: voiceTrack.enabled,
      muted: voiceTrack.muted,
      labelPrefix: voiceTrack.label.slice(0, 24),
    };
  }

  const room = readLiveKitRoom(session);
  const publications = room?.localParticipant?.audioTrackPublications;
  if (!publications) {
    return null;
  }

  for (const publication of publications.values()) {
    const track = publication.track?.mediaStreamTrack;
    if (track) {
      return {
        readyState: track.readyState,
        enabled: track.enabled,
        muted: track.muted,
        labelPrefix: track.label.slice(0, 24),
      };
    }
  }

  return null;
}

export async function readOutboundAudioRtp(
  session: LiveAvatarSession,
): Promise<OutboundAudioRtpSnapshot | null> {
  const room = readLiveKitRoom(session);
  const publications = room?.localParticipant?.audioTrackPublications;
  if (!publications) {
    return null;
  }

  for (const publication of publications.values()) {
    const mediaTrack = publication.track?.mediaStreamTrack;
    if (!mediaTrack) {
      continue;
    }

    const stream = new MediaStream([mediaTrack]);
    const pcs = (
      window as unknown as { __fspPeerConnections?: RTCPeerConnection[] }
    ).__fspPeerConnections;

    if (Array.isArray(pcs)) {
      for (const pc of pcs) {
        const report = await collectOutboundAudioFromPc(pc, stream.id);
        if (report) {
          return report;
        }
      }
    }

    return collectOutboundAudioViaSenders(session, mediaTrack);
  }

  return null;
}

async function collectOutboundAudioFromPc(
  pc: RTCPeerConnection,
  streamId: string,
): Promise<OutboundAudioRtpSnapshot | null> {
  const stats = await pc.getStats();
  for (const entry of stats.values()) {
    if (
      entry.type === "outbound-rtp" &&
      "kind" in entry &&
      entry.kind === "audio" &&
      "mediaType" in entry &&
      (entry.mediaType === "audio" || entry.kind === "audio")
    ) {
      return {
        packetsSent: Number(entry.packetsSent ?? 0),
        bytesSent: Number(entry.bytesSent ?? 0),
        trackIdentifier: String(entry.trackId ?? streamId).slice(0, 12),
      };
    }
  }
  return null;
}

async function collectOutboundAudioViaSenders(
  session: LiveAvatarSession,
  mediaTrack: MediaStreamTrack,
): Promise<OutboundAudioRtpSnapshot | null> {
  const room = readLiveKitRoom(session) as {
    engine?: { pcManager?: { publisher?: RTCPeerConnection } };
  } | null;
  const pc = room?.engine?.pcManager?.publisher;
  if (!pc) {
    return null;
  }

  const senders = pc.getSenders().filter(
    (sender) => sender.track?.kind === "audio",
  );
  for (const sender of senders) {
    if (sender.track?.id !== mediaTrack.id) {
      continue;
    }
    const stats = await sender.getStats();
    for (const entry of stats.values()) {
      if (entry.type === "outbound-rtp" && entry.kind === "audio") {
        return {
          packetsSent: Number(entry.packetsSent ?? 0),
          bytesSent: Number(entry.bytesSent ?? 0),
          trackIdentifier: mediaTrack.id.slice(0, 12),
        };
      }
    }
  }

  return null;
}

export function installPeerConnectionTap(): void {
  if (
    typeof window === "undefined" ||
    (window as unknown as { __fspPcTapInstalled?: boolean }).__fspPcTapInstalled
  ) {
    return;
  }

  const Original = RTCPeerConnection;
  const bucket: RTCPeerConnection[] = [];

  function Wrapped(this: RTCPeerConnection, ...args: ConstructorParameters<typeof RTCPeerConnection>) {
    const pc = new Original(...args);
    bucket.push(pc);
    return pc;
  }

  Wrapped.prototype = Original.prototype;
  Object.setPrototypeOf(Wrapped, Original);

  (window as unknown as { RTCPeerConnection: typeof RTCPeerConnection }).RTCPeerConnection =
    Wrapped as unknown as typeof RTCPeerConnection;
  (window as unknown as { __fspPeerConnections?: RTCPeerConnection[] }).__fspPeerConnections =
    bucket;
  (window as unknown as { __fspPcTapInstalled?: boolean }).__fspPcTapInstalled = true;
}

export function isLiveAvatarDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("fsp_debug");
}
