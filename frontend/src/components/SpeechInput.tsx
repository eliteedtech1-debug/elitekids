import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { playTap, playCorrect, playWrong } from '@/lib/utils/sound';
import { canonAnswer } from '@/lib/utils/answer';

interface SpeechInputProps {
  /** Expected correct answer(s) — the spoken word is matched against these */
  expectedAnswers: string[];
  /** Called when speech is recognized and matched (or not) */
  onResult: (spoken: string, isCorrect: boolean) => void;
  /** Whether speech input is disabled */
  disabled?: boolean;
  /** Whether to show as compact (inline) or floating */
  compact?: boolean;
  /** Language for recognition */
  lang?: string;
  /** Whether sound effects play */
  soundOn?: boolean;
}

// Normalize text for fuzzy matching: lowercase, strip punctuation, trim
function normalize(s: unknown): string {
  return canonAnswer(s);
}

// Check if spoken text matches any expected answer (fuzzy)
function matchesAnswer(spoken: string, expected: string): boolean {
  const s = normalize(spoken);
  const e = normalize(expected);
  if (!s || !e) return false;
  // Exact match
  if (s === e) return true;
  // Spoken contains expected (kid says extra words)
  if (s.includes(e)) return true;
  // Expected contains spoken (expected is longer)
  if (e.includes(s) && s.length >= 2) return true;
  // Levenshtein distance ≤ 2 for short words (typo tolerance)
  if (e.length <= 10 && levenshtein(s, e) <= 2) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

// Check if Web Speech API is available
function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export default function SpeechInput({
  expectedAnswers,
  onResult,
  disabled = false,
  compact = false,
  lang = 'en-US',
  soundOn = true,
}: SpeechInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSupported(isSpeechSupported());
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!supported || disabled || listening) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setListening(true);
      setTranscript('');
      setResult(null);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      setTranscript(finalTranscript || interimTranscript);

      if (finalTranscript) {
        // Check against all expected answers
        const isCorrect = expectedAnswers.some((a) => matchesAnswer(finalTranscript, a));
        setResult(isCorrect ? 'correct' : 'wrong');
        if (soundOn) {
          if (isCorrect) playCorrect();
          else playWrong();
        }
        onResult(finalTranscript, isCorrect);
        stopListening();
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Speech recognition error:', event.error);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setListening(false);
    }

    // Auto-stop after 8 seconds
    timeoutRef.current = setTimeout(() => {
      stopListening();
    }, 8000);
  }, [supported, disabled, listening, lang, expectedAnswers, onResult, soundOn, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  if (!supported) return null;

  if (compact) {
    return (
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
          listening
            ? 'bg-red-100 text-red-600 border border-red-300 animate-game-pulse'
            : result === 'correct'
            ? 'bg-green-100 text-green-600 border border-green-300'
            : result === 'wrong'
            ? 'bg-orange-100 text-orange-600 border border-orange-300'
            : 'bg-[#0F4D92]/10 text-[#0F4D92] border border-[#0F4D92]/20 hover:bg-[#0F4D92]/20'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        title={listening ? 'Stop listening' : 'Tap to speak your answer'}
      >
        {listening ? (
          <MicOff className="h-4 w-4 animate-game-pulse" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        {listening ? 'Listening…' : result === 'correct' ? '✅ Got it!' : result === 'wrong' ? 'Try again' : '🎤 Speak'}
        {listening && <Loader2 className="h-3 w-3 animate-spin" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        className={`relative flex items-center justify-center rounded-full transition-all ${
          listening
            ? 'h-16 w-16 bg-red-500 text-white shadow-lg animate-game-pulse'
            : result === 'correct'
            ? 'h-16 w-16 bg-green-500 text-white shadow-lg'
            : result === 'wrong'
            ? 'h-16 w-16 bg-orange-500 text-white shadow-lg'
            : 'h-16 w-16 bg-[#0F4D92] text-white shadow-lg hover:bg-[#0D3F7A] hover:scale-110 active:scale-95'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        title={listening ? 'Tap to stop' : 'Hold and speak your answer'}
      >
        {listening ? (
          <MicOff className="h-7 w-7" />
        ) : result === 'correct' ? (
          <span className="text-3xl">✅</span>
        ) : result === 'wrong' ? (
          <span className="text-3xl">❌</span>
        ) : (
          <Mic className="h-7 w-7" />
        )}
        {/* Pulsing ring when listening */}
        {listening && (
          <span className="absolute inset-0 rounded-full border-4 border-red-400 animate-game-ping" />
        )}
      </button>
      {/* Transcript display */}
      {(transcript || listening) && (
        <div className={`rounded-xl px-4 py-2 text-sm font-medium animate-game-pop ${
          listening ? 'bg-red-50 text-red-600' : result === 'correct' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
        }`}>
          {listening ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {transcript || 'Listening...'}
            </span>
          ) : (
            <span>"{transcript}"</span>
          )}
        </div>
      )}
      {!listening && !result && (
        <p className="text-xs text-gray-400 animate-game-float">Tap the mic and say the answer! 🎤</p>
      )}
    </div>
  );
}
