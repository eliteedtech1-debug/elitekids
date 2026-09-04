/**
 * VoiceRecorderField — teacher voice attachment with the two easiest
 * input paths: pick an audio file from the device file manager, or record
 * directly with the device mic. Both upload through the staff media
 * pipeline (B2 in production) and attach the playable URL to the field.
 *
 * Used by the game creator so any game item can carry the teacher's real
 * voice (GamePlay prefers item.audio over TTS automatically).
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { Mic, Upload, Play, X, Loader2, Volume2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import { uploadMediaFile } from '@/lib/api/uploadMedia';

const MAX_SECONDS = 90;

interface VoiceRecorderFieldProps {
  /** Attached audio URL (empty = none). */
  value: string;
  onChange: (url: string) => void;
  /** Field label (defaults to the i18n voice label). */
  label?: string;
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceRecorderField({ value, onChange, label }: VoiceRecorderFieldProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'' | 'uploading' | 'processing'>('');
  const [err, setErr] = useState('');

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objUrlRef = useRef<string>('');

  // Object URL for preview playback; revoked on change/unmount.
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    return () => { if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current); };
  }, []);
  const setPreview = useCallback((url: string) => {
    if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
    objUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

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

  useEffect(() => stopTimer, []);

  const startRecording = async () => {
    setErr('');
    setDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
      const mimeType = candidates.find((m) => !m || MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const out = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setPreview(URL.createObjectURL(out));
        void doUpload(out, 'voice-recording.webm');
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
      setDenied(true);
    }
  };

  /** Upload a blob/file to the media pipeline and attach the URL. */
  const doUpload = async (blob: Blob, filename: string) => {
    setBusy(true);
    setErr('');
    try {
      const url = await uploadMediaFile(blob, filename, setStage);
      onChange(url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(f.name)) {
      setErr(t('gameEditor.voiceNotAudio'));
      return;
    }
    setPreview('');
    void doUpload(f, f.name);
  };

  const clear = () => {
    stopRecording();
    setPreview('');
    setErr('');
    onChange('');
  };

  const showAttached = !busy && !!value;

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-teal-700">{label || t('gameEditor.voiceLabel')}</span>
        {showAttached && (
          <button
            type="button"
            onClick={clear}
            title={t('common.remove')}
            className="rounded p-0.5 text-gray-400 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Record with device mic */}
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-600"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {fmt(seconds)} · {t('gameEditor.voiceStop')}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy}
            title={t('gameEditor.voiceRecord')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" /> {t('gameEditor.voiceRecord')}
          </button>
        )}

        {/* Pick from device file manager */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title={t('gameEditor.voicePick')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {t('gameEditor.voicePick')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.aac"
          className="hidden"
          onChange={onPickFile}
        />

        {/* Progress / preview */}
        {busy && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {stage === 'processing' ? t('gameEditor.voiceProcessing') : t('gameEditor.voiceUploading')}
          </span>
        )}
        {showAttached && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-2.5 py-1 text-[11px] font-bold text-white">
            <Volume2 className="h-3 w-3" /> {t('gameEditor.voiceAttached')}
          </span>
        )}
        {showAttached && (
          <button
            type="button"
            onClick={() => {
              const a = new Audio(value);
              void a.play().catch(() => {});
            }}
            title={t('gameEditor.voicePreviewTitle')}
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-teal-700 hover:bg-teal-50"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        {!showAttached && previewUrl && (
          <button
            type="button"
            onClick={() => {
              const a = new Audio(previewUrl);
              void a.play().catch(() => {});
            }}
            title={t('gameEditor.voicePreviewTitle')}
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(denied || err) && (
        <p className={`mt-1.5 text-[11px] ${err ? 'text-red-600' : 'text-amber-600'}`}>
          {err || t('gameEditor.voiceMicDenied')}
        </p>
      )}
      {recording && <p className="mt-1 text-[11px] text-gray-400">{t('gameEditor.voiceMaxHint')}</p>}
    </div>
  );
}
