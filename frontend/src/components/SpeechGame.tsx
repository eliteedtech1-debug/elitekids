import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Keyboard, RotateCcw, Play, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';

/**
 * SpeechGame (Q2 Voice-First, roadmap §2.5 / Q2-B/F).
 *
 * Primary path: Web Speech API (client-side STT, <500ms, works offline on
 * Chrome/Android). Fallback path: typed answer (roadmap risk mitigation for
 * low-end devices / unsupported browsers — same scoring endpoint).
 * The transcript is scored server-side via POST /kids/speech/assess so every
 * attempt is logged for progress + the future portfolio (Q2-E).
 */

interface SpeechItem {
  id: string;
  expected_text: string;
  mode?: 'letter' | 'word' | 'sentence';
}

interface AssessResult {
  overall: number;
  passed: boolean;
  band: string;
  message: string;
  word_accuracy: number;
  letter_accuracy: number;
  fluency: number;
}

/** Attempt payload — adds the transcript/expected text the engine needs for
 * result review + SRE grading (SpeechGame only knows the score otherwise). */
export interface SpeechAttemptResult extends AssessResult {
  transcript: string;
  expected_text: string;
  question_id?: string;
}

interface SpeechGameProps {
  items: SpeechItem[];
  /** True when hosted inside GamePlay (Q2 slice 3): the host owns chrome +
   * phase flow, so finishing must NOT toast/navigate away. Default false. */
  embedded?: boolean;
  /** Called with each attempt's score so parents can award stars/XP. */
  onAttempt?: (r: SpeechAttemptResult) => void;
  onComplete?: (passedCount: number) => void;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: 1;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = 'en-NG';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  return rec;
}

export default function SpeechGame({ items, onAttempt, onComplete, embedded = false }: SpeechGameProps) {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [typedMode, setTypedMode] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssessResult | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef<number>(0);

  const item = items[idx];
  const mode = item?.mode || (item?.expected_text.trim().split(/\s+/).length > 1 ? 'sentence' : 'word');
  const supported = useMemo(() => !!getRecognition(), []);

  const cleanup = useCallback(() => {
    if (recRef.current) {
      recRef.current.onresult = null;
      recRef.current.onerror = null;
      recRef.current.onend = null;
      try { recRef.current.stop(); } catch { /* already stopped */ }
      recRef.current = null;
    }
    setListening(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const submit = useCallback(
    async (text: string, durationMs: number) => {
      if (!text.trim()) {
        toast.error(t('speech.noSpeech', { defaultValue: 'I didn’t hear anything — try again! 🎤' }));
        return;
      }
      setBusy(true);
      try {
        const { data } = await apiClient.post('/kids/speech/assess', {
          expected_text: item.expected_text,
          transcript: text,
          mode,
          duration_ms: Math.max(0, Math.round(durationMs)),
          template: mode === 'letter' ? 'speech-letter' : mode === 'sentence' ? 'speech-sentence' : 'speech-word',
        });
        const r: AssessResult = {
          overall: Number(data?.data?.overall ?? 0),
          passed: Boolean(data?.data?.passed),
          band: String(data?.data?.band ?? 'try_again'),
          message: String(data?.data?.message ?? ''),
          word_accuracy: Number(data?.data?.word_accuracy ?? 0),
          letter_accuracy: Number(data?.data?.letter_accuracy ?? 0),
          fluency: Number(data?.data?.fluency ?? 0),
        };
        setResult(r);
        if (r.passed) setPassedCount((p) => p + 1);
        onAttempt?.({
          ...r,
          transcript: text,
          expected_text: item.expected_text,
          question_id: item.id,
        });
      } catch {
        toast.error(t('speech.saveError', { defaultValue: 'Could not check your answer — check your connection. 💛' }));
      } finally {
        setBusy(false);
      }
    },
    [item, mode, onAttempt],
  );

  const startListening = useCallback(() => {
    playTap();
    setResult(null);
    setTranscript('');
    const rec = getRecognition();
    if (!rec) {
      setTypedMode(true);
      toast.error(t('speech.unsupported', { defaultValue: 'Voice not supported here — you can type it instead! ⌨️' }));
      return;
    }
    cleanup();
    recRef.current = rec;
    startedAtRef.current = Date.now();
    rec.onresult = (e: any) => {
      const text = e?.results?.[0]?.[0]?.transcript || '';
      setTranscript(text);
      cleanup();
      void submit(text, Date.now() - startedAtRef.current);
    };
    rec.onerror = (e: any) => {
      cleanup();
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setTypedMode(true);
        toast.error(t('speech.micBlocked', { defaultValue: 'Microphone is blocked — type your answer instead ⌨️' }));
      } else {
        toast.error(t('speech.noSpeech', { defaultValue: 'I didn’t hear anything — try again! 🎤' }));
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [cleanup, submit]);

  const submitTyped = useCallback(() => {
    playTap();
    void submit(typedValue, 0);
  }, [submit, typedValue]);

  const next = useCallback(() => {
    playTap();
    setResult(null);
    setTranscript('');
    setTypedValue('');
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
    } else {
      onComplete?.(passedCount);
      if (!embedded) {
        toast.success(t('speech.done', { defaultValue: 'Voice practice finished — amazing work! 🌟' }));
        navigate('/student');
      }
    }
  }, [idx, items.length, passedCount, onComplete, navigate, embedded]);

  if (!item) return null;

  return (
    <div className="mx-auto mb-4 max-w-md rounded-3xl border border-teal-200/60 bg-gradient-to-br from-white via-teal-50/60 to-emerald-50/40 p-5 shadow-lg backdrop-blur-xl">
      {/* Progress */}
      <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-teal-600">
        {t('speech.progress', { current: idx + 1, total: items.length })}
      </p>

      {/* The prompt */}
      <div className="rounded-2xl bg-white/90 p-6 text-center shadow-inner">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-500">
          {t('speech.sayThis', { defaultValue: 'Say this!' })}
        </p>
        <p className={`mt-2 font-black text-gray-800 ${mode === 'sentence' ? 'text-xl leading-snug' : 'text-5xl tracking-wide'}`}>
          {item.expected_text}
        </p>
      </div>

      {/* Answer area */}
      {!result && (
        <>
          {!typedMode ? (
            <div className="mt-5 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startListening}
                disabled={busy || listening}
                className={`inline-flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-70 ${
                  listening
                    ? 'animate-game-pulse bg-gradient-to-br from-rose-500 to-red-500 shadow-rose-300/50'
                    : 'bg-gradient-to-br from-teal-400 to-emerald-500 shadow-teal-300/50 hover:brightness-110'
                }`}
                aria-label={listening ? t('speech.listening', { defaultValue: 'Listening…' }) : t('speech.tapToSpeak', { defaultValue: 'Tap to speak' })}
              >
                <Mic className="h-9 w-9" />
              </button>
              <p className="text-xs font-bold text-teal-700">
                {listening ? t('speech.listening', { defaultValue: 'Listening…' }) : t('speech.tapToSpeak', { defaultValue: 'Tap to speak' })}
              </p>
              {transcript && <p className="text-xs italic text-gray-500">“{transcript}”</p>}
              <button
                type="button"
                onClick={() => { playTap(); setTypedMode(true); }}
                className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <Keyboard className="h-3.5 w-3.5" />
                {t('speech.typeInstead', { defaultValue: 'Type it instead' })}
              </button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <input
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
                placeholder={t('speech.typePlaceholder', { defaultValue: 'Type what you would say…' })}
                className="w-full rounded-2xl border border-teal-200 bg-white px-4 py-3 text-center text-lg font-bold text-gray-800 outline-none focus:border-teal-400"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitTyped}
                  disabled={busy || !typedValue.trim()}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-500 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? '…' : t('speech.checkAnswer', { defaultValue: 'Check my answer' })}
                </button>
                {supported && (
                  <button
                    type="button"
                    onClick={() => { playTap(); setTypedMode(false); }}
                    className="inline-flex items-center justify-center gap-1 rounded-2xl border border-teal-200 px-3 text-[11px] font-bold text-teal-600 transition hover:bg-teal-50"
                  >
                    <Mic className="h-4 w-4" />
                    {t('speech.useVoice', { defaultValue: 'Use voice' })}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Result card */}
      {result && (
        <div className={`mt-5 rounded-2xl border p-4 text-center ${result.passed ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80'}`}>
          <div className="flex items-center justify-center gap-2">
            {result.passed ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : (
              <XCircle className="h-6 w-6 text-amber-500" />
            )}
            <span className={`text-3xl font-black ${result.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
              {result.overall}%
            </span>
          </div>
          <p className="mt-1 text-sm font-bold text-gray-700">{result.message}</p>
          <button
            type="button"
            onClick={next}
            className="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95"
          >
            {idx + 1 < items.length ? (
              <>
                <Play className="h-4 w-4 fill-white" />
                {t('speech.nextOne', { defaultValue: 'Next one!' })}
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                {t('speech.finish', { defaultValue: 'All done!' })}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
