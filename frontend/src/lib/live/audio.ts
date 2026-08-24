/**
 * E3f — KidsLive client: real-time class audio over WSS (/kids-live).
 * Walkie-talkie model — one speaker at a time; server enforces teacher preemption.
 * Transport: binary Int16 PCM @16kHz mono chunks (~128ms).
 */

export type LiveRole = 'teacher' | 'student';
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

  private playCtx: AudioContext | null = null;
  private nextPlayAt = 0;

  private capCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private speaking = false;

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
      this.setStatus(this.closedByUs ? 'off' : 'error');
      if (!this.closedByUs) {
        this.reconnectTimer = window.setTimeout(() => this.connect(this.token), 5000);
      }
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* noop */ }
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.enqueuePlayback(ev.data);
        return;
      }
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.type) {
        case 'welcome':
          this.role = String(msg.role) as LiveRole;
          this.hasFloor = !!msg.floor || this.role === 'teacher';
          break;
        case 'presence':
          this.handlers.onPresence?.((msg.online as LivePeer[]) || []);
          break;
        case 'live':
          this.handlers.onTeacherLive?.(!!msg.on);
          break;
        case 'you-floor':
          this.hasFloor = !!msg.on;
          this.handlers.onYouFloor?.(this.hasFloor);
          break;
        default:
          break;
      }
    };
  }

  disconnect() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopSpeaking();
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.setStatus('off');
  }

  /** Teacher grants/revokes a student's mic. */
  giveFloor(adm: string, on: boolean) {
    this.sendJson({ type: 'floor', adm, on });
  }

  /** Start capturing + streaming the local mic (teacher anytime; student only when floored). */
  async startSpeaking(): Promise<boolean> {
    if (this.speaking) return true;
    if (!this.hasFloor) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate: 16000 });
      } catch {
        ctx = new AudioContext();
      }
      this.capCtx = ctx;
      await ctx.resume();
      const src = ctx.createMediaStreamSource(this.micStream);
      const sp = ctx.createScriptProcessor(CHUNK, 1, 1);
      this.processor = sp;
      // Muted pass-through keeps the processor pumping without feedback
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

  private sendJson(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private setStatus(s: typeof this.status) {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private ensurePlayCtx(): AudioContext {
    if (!this.playCtx) {
      try {
        this.playCtx = new AudioContext({ sampleRate: 16000 });
      } catch {
        this.playCtx = new AudioContext();
      }
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
