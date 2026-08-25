/**
 * E4 — WebRTC P2P audio adapter for KidsLive.
 *
 * Replaces the server-side PCM binary relay with direct RTCPeerConnections.
 * Teacher maintains one PC per student; floored students add mic tracks.
 * All signaling goes over the existing WebSocket (e3fLive.js).
 *
 * Env gate: server LIVE_WEBRTC=1 enables WebRTC signaling.
 * Fallback: when server doesn't send webrtc:true in welcome, client
 *           falls back to PCM binary relay (audio.ts handles this).
 */

// ─── ICE server config ───────────────────────────────────────────────────────
// Default: Google STUN only (works for non-CGNAT; TURN needed for CGNAT).
// Server sends iceServers in welcome message when LIVE_WEBRTC=1.
const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let _iceServers: RTCIceServer[] = DEFAULT_ICE;

/** Update ICE servers from server welcome message. */
export function setIceServers(servers: RTCIceServer[]) {
  if (Array.isArray(servers) && servers.length) _iceServers = servers;
}

function getIceServers(): RTCIceServer[] { return _iceServers; }

// ─── Types ───────────────────────────────────────────────────────────────────
export interface WebRTCSignalingSend {
  (msg: Record<string, unknown>): void;
}

export interface WebRTCHandlers {
  /** Remote audio stream received from teacher (or floored student). */
  onRemoteAudio?: (stream: MediaStream, peerAdm: string) => void;
  /** Remote audio stream removed (peer disconnected or stopped). */
  onRemoteAudioRemoved?: (peerAdm: string) => void;
  /** Connection state changed for a peer. */
  onPeerState?: (peerAdm: string, state: RTCPeerConnectionState) => void;
}

// ─── Teacher-side adapter ────────────────────────────────────────────────────
export class TeacherWebRTC {
  private pcs = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private sendSignal: WebRTCSignalingSend;
  private handlers: WebRTCHandlers;
  private iceServers: RTCIceServer[];

  constructor(sendSignal: WebRTCSignalingSend, handlers: WebRTCHandlers = {}) {
    this.sendSignal = sendSignal;
    this.handlers = handlers;
    this.iceServers = getIceServers();
  }

  /** Called when a student joins — create PC and send offer. */
  async addStudent(adm: string) {
    if (this.pcs.has(adm)) return;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pcs.set(adm, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal({ type: 'webrtc-ice', to: adm, candidate: e.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      this.handlers.onPeerState?.(adm, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removeStudent(adm);
      }
    };

    // Add local audio track if already broadcasting
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal({ type: 'webrtc-offer', to: adm, sdp: pc.localDescription!.toJSON() });
  }

  /** Handle SDP answer from a student. */
  async handleAnswer(adm: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.pcs.get(adm);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  /** Handle ICE candidate from a student. */
  async handleIce(adm: string, candidate: RTCIceCandidateInit) {
    const pc = this.pcs.get(adm);
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Start broadcasting — capture mic and add to all PCs. */
  async startBroadcast(): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Add track to all existing PCs
      for (const [, pc] of this.pcs) {
        for (const track of this.localStream.getAudioTracks()) {
          pc.addTrack(track, this.localStream);
        }
      }
      return this.localStream;
    } catch {
      return null;
    }
  }

  /** Stop broadcasting — remove mic tracks from all PCs. */
  stopBroadcast() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    // Remove senders from all PCs to trigger renegotiation
    for (const [, pc] of this.pcs) {
      for (const sender of pc.getSenders()) {
        if (sender.track) {
          sender.replaceTrack(null);
        }
      }
    }
  }

  /** Remove a student's peer connection. */
  removeStudent(adm: string) {
    const pc = this.pcs.get(adm);
    if (pc) {
      pc.close();
      this.pcs.delete(adm);
      this.handlers.onRemoteAudioRemoved?.(adm);
    }
  }

  /** Tear down all connections. */
  destroy() {
    this.stopBroadcast();
    for (const [adm, pc] of this.pcs) {
      pc.close();
      this.handlers.onRemoteAudioRemoved?.(adm);
    }
    this.pcs.clear();
  }

  get peerCount() { return this.pcs.size; }
  get isBroadcasting() { return !!this.localStream; }
}

// ─── Student-side adapter ────────────────────────────────────────────────────
export class StudentWebRTC {
  private pc: RTCPeerConnection | null = null;
  private micStream: MediaStream | null = null;
  private micSender: RTCRtpSender | null = null;
  private sendSignal: WebRTCSignalingSend;
  private handlers: WebRTCHandlers;
  private iceServers: RTCIceServer[];
  private teacherAdm = '';

  constructor(sendSignal: WebRTCSignalingSend, handlers: WebRTCHandlers = {}) {
    this.sendSignal = sendSignal;
    this.handlers = handlers;
    this.iceServers = getIceServers();
  }

  /** Set the teacher's admission id (from signaling). */
  setTeacher(adm: string) { this.teacherAdm = adm; }

  /** Handle SDP offer from teacher — create PC, set remote, answer. */
  async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    this.teacherAdm = from;
    // Close existing PC if any
    if (this.pc) this.pc.close();

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal({ type: 'webrtc-ice', candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        this.handlers.onRemoteAudio?.(e.streams[0], from);
      }
    };
    pc.onconnectionstatechange = () => {
      this.handlers.onPeerState?.(from, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlers.onRemoteAudioRemoved?.(from);
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignal({ type: 'webrtc-answer', sdp: pc.localDescription!.toJSON() });
  }

  /** Handle ICE candidate from teacher. */
  async handleIce(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Add mic track (when granted floor). Returns true on success. */
  async addMic(): Promise<boolean> {
    if (!this.pc) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = this.micStream.getAudioTracks()[0];
      this.micSender = this.pc.addTrack(track, this.micStream);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove mic track (when floor revoked). */
  removeMic() {
    if (this.micSender && this.pc) {
      this.pc.removeTrack(this.micSender);
      this.micSender = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) track.stop();
      this.micStream = null;
    }
  }

  /** Tear down the connection. */
  destroy() {
    this.removeMic();
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  get hasMic() { return !!this.micSender; }
}
