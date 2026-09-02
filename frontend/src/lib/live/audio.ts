/**
 * E3f/E4 — KidsLive client: real-time class audio over WSS (/kids-live).
 * Walkie-talkie model — one speaker at a time; server enforces teacher preemption.
 *
 * Transport modes (auto-negotiated):
 *   1. WebRTC P2P (E4): server sends webrtc:true in welcome → uses RTCPeerConnection
 *      for Opus audio streams. Teacher publishes to all students; floored student
 *      publishes mic back. Zero server-side media processing.
 *   2. PCM relay (legacy): server sends webrtc:false → binary Int16 PCM @16kHz mono
 *      chunks (~128ms) relayed through the WebSocket server.
 */

import { TeacherWebRTC, StudentWebRTC, setIceServers } from './webrtc';
import { liveEvents } from './events';

export type LiveRole = 'teacher' | 'student' | 'parent';
export interface LivePeer {
  adm: string;
  name: string;
  role: LiveRole;
  floor: boolean;
}
export interface LiveHandlers {
  onStatus?: (s: 'off' | 'connecting' | 'live' | 'error') => void;
  onPresence?: (peers: LivePeer[]) => void;
  onTeacherLive?: (on: boolean) => void;
  onYouFloor?: (on: boolean) => void;
  onArenaScore?: (data: { competitionId: string; childAdmissionNo: string; score: number; mode: string | null; ts: number }) => void;
  onRaidHp?: (data: { raidId: string; guardianSlug: string; guardianName: string; guardianEmoji: string; currentHp: number; maxHp: number; defeated: boolean; damagedBy: string; ts: number }) => void;
  onFestivalHp?: (data: { festivalId: string; guardianSlug: string; guardianName: string; guardianEmoji: string; currentHp: number; maxHp: number; defeated: boolean; allDefeated: boolean; damagedBy: string; ts: number }) => void;
  onReaction?: (data: { emoji: string; from: string; ts: number }) => void;
  onParentNotification?: (data: { notification: { type: string; title: string; body: string; child_admission_no: string; created_at: string } }) => void;
}

const CHUNK = 2048;

function floatToInt16(input: Float32Array): ArrayBuffer {
  const out = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out.buffer;
}

export class EliteLive {
  private ws: WebSocket | null = null;
  private token = '';
  private handlers: LiveHandlers = {};
  private reconnectTimer: number | null = null;
  private closedByUs = false;

  // PCM relay fallback (legacy)
  private playCtx: AudioContext | null = null;
  private nextPlayAt = 0;
  private capCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private speaking = false;

  // WebRTC P2P (E4)
  private webrtcMode = false;
  private teacherRtc: TeacherWebRTC | null = null;
  private studentRtc: StudentWebRTC | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;

  role: LiveRole = 'student';
  status: 'off' | 'connecting' | 'live' | 'error' = 'off';
  hasFloor = false;

  constructor(handlers: LiveHandlers) {
    this.handlers = handlers;
  }

  connect(token: string, extraQuery = '') {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.closedByUs = false;
    this.token = token;
    this.setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = extraQuery ? `&${extraQuery.replace(/^\?/, '')}` : '';
    const ws = new WebSocket(`${proto}//${location.host}/kids/live?token=${encodeURIComponent(token)}${qs}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => this.setStatus('live');
    ws.onclose = () => {
      this.stopSpeaking();
      this.cleanupWebRTC();
      this.setStatus(this.closedByUs ? 'off' : 'error');
      if (!this.closedByUs) {
        this.reconnectTimer = window.setTimeout(() => this.connect(this.token), 5000);
      }
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };

    ws.onmessage = (ev) => {
      // PCM binary frame (legacy relay mode)
      if (ev.data instanceof ArrayBuffer) {
        if (!this.webrtcMode) this.enqueuePlayback(ev.data);
        return;
      }
      // JSON control messages
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      this.handleSignal(msg);
    };
  }

  disconnect() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopSpeaking();
    this.cleanupWebRTC();
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.setStatus('off');
  }

  /** Teacher grants/revokes a student's mic. */
  giveFloor(adm: string, on: boolean) {
    this.sendJson({ type: 'floor', adm, on });
  }

  /** Send an emoji reaction to all peers in the class. */
  sendReaction(emoji: string, classCode?: string) {
    this.sendJson({ type: 'reaction', emoji, classCode: classCode || '' });
  }

  /** Start capturing + streaming the local mic. */
  async startSpeaking(): Promise<boolean> {
    if (this.speaking) return true;
    if (!this.hasFloor) return false;

    if (this.webrtcMode && this.role === 'student' && this.studentRtc) {
      // WebRTC: add mic track to the existing peer connection
      const ok = await this.studentRtc.addMic();
      if (ok) this.speaking = true;
      return ok;
    }

    // PCM relay fallback
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      let ctx: AudioContext;
      try { ctx = new AudioContext({ sampleRate: 16000 }); } catch { ctx = new AudioContext(); }
      this.capCtx = ctx;
      await ctx.resume();
      const src = ctx.createMediaStreamSource(this.micStream);
      const sp = ctx.createScriptProcessor(CHUNK, 1, 1);
      this.processor = sp;
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(sp);
      sp.connect(mute);
      mute.connect(ctx.destination);
      sp.onaudioprocess = (e) => {
        if (!this.speaking || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const buf = floatToInt16(e.inputBuffer.getChannelData(0));
        this.ws.send(buf);
      };
      this.speaking = true;
      return true;
    } catch {
      this.stopSpeaking();
      return false;
    }
  }

  stopSpeaking() {
    this.speaking = false;
    if (this.webrtcMode && this.studentRtc) {
      this.studentRtc.removeMic();
      return;
    }
    // PCM fallback cleanup
    try { this.processor?.disconnect(); } catch { /* noop */ }
    try { this.capCtx?.close(); } catch { /* noop */ }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.processor = null;
    this.capCtx = null;
    this.micStream = null;
  }

  get isSpeaking() {
    return this.speaking;
  }

  // ─── Signal handling ────────────────────────────────────────────────────────

  private handleSignal(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'welcome':
        this.role = String(msg.role) as LiveRole;
        this.hasFloor = !!msg.floor || this.role === 'teacher';
        liveEvents.emit('teacher-live', { on: !!msg.live });
        // Negotiate transport mode
        this.webrtcMode = !!msg.webrtc && typeof RTCPeerConnection !== 'undefined';
        if (this.webrtcMode) {
          // Apply TURN/STUN config from server
          if (Array.isArray(msg.iceServers)) setIceServers(msg.iceServers as RTCIceServer[]);
          this.initWebRTC();
        }
        break;

      case 'presence':
        this.handlers.onPresence?.((msg.online as LivePeer[]) || []);
        liveEvents.emit('presence', msg);
        // WebRTC: create PCs for newly-joined students (teacher only)
        if (this.webrtcMode && this.role === 'teacher' && this.teacherRtc) {
          const students = (msg.online as LivePeer[]).filter((p) => p.role === 'student');
          for (const s of students) {
            this.teacherRtc.addStudent(s.adm);
          }
        }
        break;

      case 'live':
        this.handlers.onTeacherLive?.(!!msg.on);
        liveEvents.emit('teacher-live', msg);
        break;

      case 'you-floor':
        this.hasFloor = !!msg.on;
        this.handlers.onYouFloor?.(this.hasFloor);
        liveEvents.emit('you-floor', msg);
        break;

      // ── WebRTC signaling ──────────────────────────────────────────────
      case 'webrtc-start':
        // Teacher started broadcasting — create PCs for all online students
        if (this.webrtcMode && this.role === 'student') {
          // Teacher will send offers via webrtc-offer messages
        }
        break;

      case 'webrtc-stop':
        if (this.webrtcMode && this.role === 'student') {
          this.studentRtc?.destroy();
          this.studentRtc = null;
          this.removeRemoteAudio();
        }
        break;

      case 'webrtc-offer':
        // Student receives offer from teacher
        if (this.webrtcMode && this.role === 'student') {
          this.ensureStudentRtc();
          this.studentRtc!.handleOffer(String(msg.from || ''), msg.sdp as RTCSessionDescriptionInit);
        }
        break;

      case 'webrtc-answer':
        // Teacher receives answer from student
        if (this.webrtcMode && this.role === 'teacher' && this.teacherRtc) {
          this.teacherRtc.handleAnswer(String(msg.from || ''), msg.sdp as RTCSessionDescriptionInit);
        }
        break;

      case 'webrtc-ice':
        if (this.webrtcMode) {
          if (this.role === 'teacher' && this.teacherRtc) {
            this.teacherRtc.handleIce(String(msg.from || ''), msg.candidate as RTCIceCandidateInit);
          } else if (this.role === 'student' && this.studentRtc) {
            this.studentRtc.handleIce(msg.candidate as RTCIceCandidateInit);
          }
        }
        break;

      case 'you-mic':
        // Student: teacher granted/revoked mic — add/remove WebRTC mic track
        if (this.webrtcMode && this.role === 'student') {
          if (!!msg.on && this.studentRtc) {
            this.studentRtc.addMic().then((ok) => {
              if (ok) this.speaking = true;
            });
          } else if (!msg.on) {
            this.studentRtc?.removeMic();
            this.speaking = false;
          }
        }
        break;

      // ── Arena / Competition real-time events ──────────────────────────
      case 'arena-score':
        this.handlers.onArenaScore?.(msg as any);
        liveEvents.emit('arena-score', msg);
        break;

      case 'raid-hp':
        this.handlers.onRaidHp?.(msg as any);
        liveEvents.emit('raid-hp', msg);
        break;

      case 'festival-hp':
        this.handlers.onFestivalHp?.(msg as any);
        liveEvents.emit('festival-hp', msg);
        break;

      case 'reaction':
        this.handlers.onReaction?.(msg as any);
        liveEvents.emit('reaction', msg);
        break;

      case 'parent-notification':
        this.handlers.onParentNotification?.(msg as any);
        liveEvents.emit('parent-notification', msg);
        break;

      default:
        break;
    }
  }

  // ─── WebRTC lifecycle ───────────────────────────────────────────────────────

  private initWebRTC() {
    const sendSignal = (obj: Record<string, unknown>) => this.sendJson(obj);

    if (this.role === 'teacher') {
      this.teacherRtc = new TeacherWebRTC(sendSignal, {
        onRemoteAudio: (stream, adm) => this.playRemoteStream(stream, adm),
        onRemoteAudioRemoved: (adm) => this.removeRemoteAudio(adm),
      });
      // If teacher is already broadcasting when WebRTC activates, start the mic
      if (this.speaking) {
        this.teacherRtc.startBroadcast().then((stream) => {
          if (stream) this.speaking = true;
        });
      }
    } else {
      this.studentRtc = new StudentWebRTC(sendSignal, {
        onRemoteAudio: (stream) => this.playRemoteStream(stream, 'teacher'),
        onRemoteAudioRemoved: () => this.removeRemoteAudio(),
      });
    }
  }

  private ensureStudentRtc() {
    if (this.studentRtc) return;
    const sendSignal = (obj: Record<string, unknown>) => this.sendJson(obj);
    this.studentRtc = new StudentWebRTC(sendSignal, {
      onRemoteAudio: (stream) => this.playRemoteStream(stream, 'teacher'),
      onRemoteAudioRemoved: () => this.removeRemoteAudio(),
    });
  }

  private cleanupWebRTC() {
    this.teacherRtc?.destroy();
    this.teacherRtc = null;
    this.studentRtc?.destroy();
    this.studentRtc = null;
    this.removeRemoteAudio();
    this.webrtcMode = false;
  }

  // ─── Remote audio playback ──────────────────────────────────────────────────

  private playRemoteStream(stream: MediaStream, _peerAdm: string) {
    this.removeRemoteAudio();
    const el = document.createElement('audio');
    el.srcObject = stream;
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    this.remoteAudioEl = el;
  }

  private removeRemoteAudio(_peerAdm?: string) {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.remove();
      this.remoteAudioEl = null;
    }
  }

  // ─── PCM playback (legacy) ──────────────────────────────────────────────────

  private sendJson(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private setStatus(s: typeof this.status) {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private ensurePlayCtx(): AudioContext {
    if (!this.playCtx) {
      try { this.playCtx = new AudioContext({ sampleRate: 16000 }); } catch { this.playCtx = new AudioContext(); }
    }
    if (this.playCtx.state === 'suspended') void this.playCtx.resume();
    return this.playCtx;
  }

  /** Jitter-buffered sequential playback (~120ms lead) — single speaker so one queue suffices. */
  private enqueuePlayback(buf: ArrayBuffer) {
    const ctx = this.ensurePlayCtx();
    const samples = buf.byteLength >> 1;
    if (samples <= 0) return;
    const audioBuf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const ch = audioBuf.getChannelData(0);
    const view = new DataView(buf);
    for (let i = 0; i < samples; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (this.nextPlayAt < now + 0.03) this.nextPlayAt = now + 0.12;
    src.start(this.nextPlayAt);
    this.nextPlayAt += audioBuf.duration;
  }
}
