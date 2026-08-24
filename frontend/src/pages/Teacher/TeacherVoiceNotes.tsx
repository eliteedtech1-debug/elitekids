import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, Loader2, ArrowLeft, Trash2, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import AdminNav from '@/components/AdminNav';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * E4-P0 — Teacher Voice Notes: record a ≤90s message, send it to a class,
 * every kid gets a push nudge and can listen from home. The always-available
 * companion to Live Class Audio (works even when nobody is online right now).
 */

const MAX_SECONDS = 90;

interface SentNote {
  id: string;
  title: string | null;
  class_code: string | null;
  duration_s: number | null;
  created_at: string;
  reached: number;
  played_count: number;
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* keep trying */ }
  }
  return '';
}

export default function TeacherVoiceNotes() {
  const [title, setTitle] = useState('');
  const [classCode, setClassCode] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [sent, setSent] = useState<SentNote[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const loadSent = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.VOICE.MINE).catch(() => null);
      if (res?.data?.success) setSent(res.data.data || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadSent(); }, [loadSent]);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    stopTimer();
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    setRecording(false);
  }, []);

  const startRecording = async () => {
    setBlob(null);
    setPreviewUrl('');
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const out = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setBlob(out);
        setPreviewUrl(URL.createObjectURL(out));
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setMicDenied(true);
      toast.error('Microphone unavailable — check browser permissions');
    }
  };

  const discard = () => {
    stopTimer();
    setBlob(null);
    setPreviewUrl('');
    setSeconds(0);
    setRecording(false);
  };

  const send = async () => {
    if (!blob || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice-note.webm');
      fd.append('title', title.trim());
      fd.append('class_code', classCode.trim());
      fd.append('duration_s', String(seconds));
      const res = await apiClient.post(ENDPOINTS.VOICE.LIST, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res?.data?.success) {
        toast.success('Sent! Kids have been notified 🎙️');
        discard();
        setTitle('');
        loadSent();
      } else {
        toast.error(res?.data?.message || 'Could not send');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Mic className="h-6 w-6 text-purple-600" /> Voice Notes
          </h1>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F4D92]">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          Record a short message for your class — kids hear your voice wherever they are, even offline-later.
        </p>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="text-xs font-bold text-gray-600">
            Title <span className="font-normal text-gray-400">(what's the message about?)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Well done on yesterday's test!"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="mt-3 block text-xs font-bold text-gray-600">
            Class code <span className="font-normal text-gray-400">(leave empty to reach the whole school)</span>
            <input
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              placeholder="e.g. CLS0610"
              className="mt-1 w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal uppercase"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-extrabold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                <Mic className="h-5 w-5" /> Record
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-6 py-3 text-base font-extrabold text-white shadow hover:bg-black"
              >
                <Square className="h-4 w-4" /> Stop ({seconds}s / {MAX_SECONDS}s)
              </button>
            )}
            {recording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC
              </span>
            )}
            {blob && !recording && (
              <>
                <button onClick={discard} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
                  <Trash2 className="h-4 w-4" /> Discard
                </button>
                <button
                  onClick={send}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-base font-extrabold text-white shadow hover:bg-green-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send to class
                </button>
              </>
            )}
          </div>
          {micDenied && (
            <p className="mt-3 text-xs font-semibold text-red-500">Microphone blocked — allow mic access in your browser settings.</p>
          )}
          {previewUrl && !recording && (
            <audio controls src={previewUrl} className="mt-4 w-full" />
          )}
        </div>

        <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-400">
          <Radio className="h-4 w-4" /> Notes you sent
        </h2>
        {sent.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
            Nothing yet — record your first note above.
          </p>
        ) : (
          <div className="space-y-2">
            {sent.map((n) => (
              <div key={n.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <span className="text-xl">🎙️</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800">{n.title || 'Voice note'}</span>
                  <span className="block text-xs text-gray-400">
                    {n.class_code ? `Class ${n.class_code} · ` : 'Whole school · '}
                    {new Date(n.created_at).toLocaleString()} · reached {Number(n.reached) || 0}, listened {Number(n.played_count) || 0}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
