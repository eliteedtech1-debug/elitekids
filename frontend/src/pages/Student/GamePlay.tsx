import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Gamepad2,
  Star,
  Trophy,
  RotateCcw,
  Volume2,
  VolumeX,
  Timer,
  CheckCircle2,
  XCircle,
  Zap,
  Palette,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import TimerBar from '@/components/Timer';
import { getItemVisual, getNumberEmoji, getNumberImageUrl } from '@/lib/utils/icons';
import { useA11yStore } from '@/lib/utils/a11y-store';
import SpeechSettings from '@/components/SpeechSettings';
import SpeechInput from '@/components/SpeechInput';
import CachedImg from '@/components/CachedImg';
import { getFeedbackClasses, getTimerColor, FOCUS_RING_GAME, motionClass } from '@/lib/utils/accessibility';
import {
  speak,
  playCorrect,
  playWrong,
  playComplete,
  playTap,
  playDance,
  playMatch,
  playPlace,
  speakScene,
  speakComplete,
  speakItem,
  speakAnimal,
  speakShape,
  speakColor,
} from '@/lib/utils/sound';

/* ── Item visual renderer (image → emoji → color → text) ── */

function ItemIcon({ emoji, imageUrl, label, color, size = 'lg' }: {
  emoji?: string;
  imageUrl?: string | null;
  label: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sz = size === 'sm' ? 'h-10 w-10' : size === 'md' ? 'h-12 w-12' : 'h-16 w-16';
  const textSize = size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg';
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Fallback chain: image → emoji → color swatch → text */}
      {imageUrl && !imgFailed ? (
        <img
          src={imageUrl}
          alt={label}
          className={`${sz} object-contain font-kid drop-shadow-sm animate-game-pop`}
          onError={() => setImgFailed(true)}
        />
      ) : emoji ? (
        <span className={`${sz} flex items-center justify-center text-4xl font-kid`} role="img" aria-label={label}>
          {emoji}
        </span>
      ) : color ? (
        <div className={`${sz} rounded-full shadow-inner border-2 border-white/50`} style={{ backgroundColor: color }} />
      ) : (
        <span className={`${sz} flex items-center justify-center font-kid font-bold text-2xl text-gray-600 bg-gray-100 rounded-full`}>{label.slice(0, 2).toUpperCase()}</span>
      )}
      <span className={`${textSize} font-kid-body font-semibold text-gray-600`}>{label}</span>
    </div>
  );
}

function PairIcon({ text, size = 'lg' }: { text: string; size?: 'sm' | 'md' | 'lg' }) {
  // Parse "🍎 Apple" → emoji + label
  const match = text.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*(.+)$/u);
  const emoji = match?.[1] || '';
  const label = match?.[2] || text;
  const visual = getItemVisual(label);
  return <ItemIcon emoji={visual.emoji || emoji} imageUrl={visual.imageUrl} label={label} size={size} />;
}

/* ── Types ────────────────────────────────────────────────────── */

interface GameConfig {
  id?: string;
  template: string;
  lessonId?: string;
  ageLevel?: string;
  pairs?: { a: string; b: string; audio?: string }[];
  items?: { hex?: string; color?: string; num?: number; label?: string; image?: string; emoji?: string; sound?: string; audio?: string }[];
  objects?: { id: string; label: string; image?: string }[];
  correctId?: string;
  question?: string;
  options?: { id: string; label: string; image?: string; emoji?: string; audio?: string }[];
  answer?: string;
  questions?: { id?: string; prompt?: string; question?: string; image?: string; options?: { id: string; label: string; image?: string; emoji?: string; audio?: string }[]; correctIndex?: number; correctId?: string; answer?: string }[];
  context?: string;
  sentences?: { sentence: string; blanks: { id: number; answer: string }[]; wordBank?: string[]; context?: string }[];
  durationSec?: number;
  sentence?: string;
  blanks?: { id: number; answer: string }[];
  wordBank?: string[];
  // Input mode: 'tap' | 'speak' | 'both' — controls whether kids tap, speak, or both
  inputMode?: 'tap' | 'speak' | 'both';
  // Puzzle
  originalImageUrl?: string;
  pieces?: { id: string; row: number; col: number; imageUrl: string }[];
  grid?: { rows: number; cols: number };
  pieceSize?: { width: number; height: number };
  difficulties?: Record<string, {
    pieces: { id: string; row: number; col: number; imageUrl: string }[];
    grid: { rows: number; cols: number };
    pieceSize: { width: number; height: number };
    label: string;
    emoji: string;
    minAge: string;
  }>;
}

interface SceneText {
  id: number;
  text: string;
  type: string;
}

interface SceneWrapper {
  scenes?: SceneText[];
  [key: string]: unknown;
}

type GameMode = 'practice' | 'test' | 'learning';
type Phase = 'intro' | 'play' | 'waiting-submit' | 'result' | 'learning-done' | 'retry-practice';
type AnswerResult = { correct: boolean; expected: string; given: string };

/* ── Helpers ────────────────────────────────────────────────── */

/** Get the best readable label for display/speech.
 * Priority: label > color (if not hex) > emoji. Never returns hex codes. */
function readableLabel(label?: string, color?: string, emoji?: string): string {
  if (label && !label.startsWith('#')) return label.trim();
  if (color && !color.startsWith('#')) return color.trim();
  return '';
}

/** Check if a string is a hex color code. */
function isHex(s?: string): boolean {
  return !!s && /^#[0-9A-Fa-f]{3,8}$/.test(s);
}

/** Get the best text to speak for an item.
 * Priority: label > color > emoji name. */
function speakLabel(label?: string, color?: string, emoji?: string): string {
  if (label) return label.trim();
  if (color && !color.startsWith('#')) return color.trim();
  if (emoji) return emoji.trim();
  return '';
}

/** Strip emojis from text so speech only reads the label word. */
function stripEmoji(text: string): string {
  return text.replace(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F?/gu, '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
}

/** Play a teacher-recorded audio file, or fall back to TTS speak. */
function speakOrPlay(audioUrl?: string, fallbackText?: string): Promise<void> {
  if (audioUrl) {
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => resolve();
      audio.onerror = () => {
        // Audio failed — fall back to TTS
        if (fallbackText) speak(fallbackText).then(resolve);
        else resolve();
      };
      audio.play().catch(() => {
        if (fallbackText) speak(fallbackText).then(resolve);
        else resolve();
      });
    });
  }
  if (fallbackText) return speak(fallbackText);
  return Promise.resolve();
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Matching Game ──────────────────────────────────────────── */

function MatchingGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const pairs = config.pairs || [];
  const [selected, setSelected] = useState<{ side: 'a' | 'b'; index: number } | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [dancing, setDancing] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const shuffledB = useRef(shuffle(pairs.map((p, i) => ({ label: p.b, origIdx: i }))));
  const isTest = mode === 'test';

  const handlePick = (side: 'a' | 'b', index: number, origIdx?: number) => {
    if (soundOn) playTap();
    setDancing(`${side}-${index}`);
    setTimeout(() => setDancing(null), 300);
    if (matched.has(index) && side === 'a') return;

    if (!selected) {
      setSelected({ side, index: side === 'a' ? index : (origIdx ?? index) });
      return;
    }
    if (selected.side === side) {
      setSelected({ side, index: side === 'a' ? index : (origIdx ?? index) });
      return;
    }

    const aIdx = side === 'a' ? index : selected.index;
    const bOrigIdx = side === 'b' ? (origIdx ?? index) : selected.index;

    if (aIdx === bOrigIdx) {
      if (!isTest && soundOn) playMatch();
      const newMatched = new Set(matched);
      newMatched.add(aIdx);
      setMatched(newMatched);
      if (!isTest) setCelebrate(aIdx);
      setScore((s) => s + 10);
      setSelected(null);
      if (!isTest) setTimeout(() => setCelebrate(null), 600);
      onAnswer?.({ correct: true, expected: pairs[aIdx].a, given: pairs[aIdx].b });
      if (newMatched.size === pairs.length) {
        setTimeout(() => onComplete(score + 10), isTest ? 200 : 800);
      }
    } else {
      if (!isTest && soundOn) playWrong();
      if (!isTest) {
        setWrong(`${side}-${index}`);
        setTimeout(() => setWrong(null), 500);
      }
      onAnswer?.({ correct: false, expected: pairs[aIdx].a, given: pairs[bOrigIdx]?.b || '?' });
      setSelected(null);
    }
  };

  const isMatchedA = (i: number) => matched.has(i);

  // ── Learning mode auto-play — speak each name one by one ──
  useEffect(() => {
    if (mode !== 'learning') return;
    const nextIdx = pairs.findIndex((_, i) => !matched.has(i));
    if (nextIdx === -1) return;
    const pair = pairs[nextIdx];
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Step 1: Highlight left side → say "A"
      setSelected({ side: 'a', index: nextIdx });
      if (soundOn) await speakOrPlay(pair.audio, stripEmoji(pair.a) || pair.a);
      if (cancelled) return;
      // Step 2: Highlight right side → say "Apple"
      setSelected({ side: 'b', index: nextIdx });
      if (soundOn) await speakOrPlay(pair.audio, stripEmoji(pair.b) || pair.b);
      if (cancelled) return;
      // Step 3: Match them + celebrate
      if (soundOn) playMatch();
      const newMatched = new Set(matched);
      newMatched.add(nextIdx);
      setMatched(newMatched);
      setCelebrate(nextIdx);
      setSelected(null);
      onAnswer?.({ correct: true, expected: pair.a, given: pair.b });
      setTimeout(() => setCelebrate(null), 600);
      if (newMatched.size === pairs.length) {
        setTimeout(() => onComplete(0), 800);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, matched, pairs, soundOn, onComplete, onAnswer]);

  return (
    <div className="space-y-6">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — No feedback shown until you submit
        </p>
      )}
      <p className="text-center text-sm font-medium text-gray-500">Tap a letter on the left, match it on the right</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          {pairs.map((pair, i) => (
            <button
              key={`a-${i}`}
              onClick={() => handlePick('a', i)}
              disabled={isMatchedA(i)}
              className={`w-full rounded-xl border-2 p-4 text-left text-lg font-semibold transition-all animate-game-slide-left stagger-${Math.min(i + 1, 12)} ${
                isMatchedA(i)
                  ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} opacity-70 animate-game-correct`
                  : selected?.side === 'a' && selected.index === i
                  ? 'border-blue-500 bg-blue-50 shadow-lg animate-game-jelly'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:animate-game-squish'
              } ${!isTest && wrong?.startsWith(`a-${i}`) ? `animate-game-wrong ${cbWrong.border} ${cbWrong.bg}` : ''} ${celebrate === i ? 'animate-game-dance' : ''} ${dancing === `a-${i}` ? 'animate-game-tap-ripple' : ''}`}
            >
              {pair.a}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {shuffledB.current.map((item, i) => (
            <button
              key={`b-${item.origIdx}`}
              onClick={() => handlePick('b', item.origIdx, item.origIdx)}
              disabled={isMatchedA(item.origIdx)}
              className={`w-full rounded-xl border-2 p-4 text-left text-lg font-semibold transition-all animate-game-slide-right stagger-${Math.min(i + 1, 12)} ${
                isMatchedA(item.origIdx)
                  ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} opacity-70 animate-game-correct`
                  : selected?.side === 'b' && selected.index === item.origIdx
                  ? 'border-blue-500 bg-blue-50 shadow-lg animate-game-jelly'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:animate-game-squish'
              } ${!isTest && wrong?.startsWith(`b-${item.origIdx}`) ? `animate-game-wrong ${cbWrong.border} ${cbWrong.bg}` : ''} ${celebrate === item.origIdx ? 'animate-game-dance' : ''} ${dancing === `b-${item.origIdx}` ? 'animate-game-tap-ripple' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Tap Recognition Game ──────────────────────────────────── */

function TapGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const items = config.items || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [popId, setPopId] = useState<number | null>(null);
  const [tapping, setTapping] = useState<number | null>(null);
  const isTest = mode === 'test';
  const current = items[currentIdx];

  const handleTap = (idx: number) => {
    if (feedback) return;
    const isCorrect = idx === currentIdx;
    // In test mode: no sound, no tapping animation, no feedback for wrong answers
    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(idx);
      setTimeout(() => setTapping(null), 300);
    }

    if (isCorrect) {
      if (!isTest && soundOn) playCorrect();
      if (!isTest) setFeedback('correct');
      setPopId(idx);
      setScore((s) => s + 10);
      onAnswer?.({ correct: true, expected: current?.color || current?.label || '', given: items[idx]?.color || items[idx]?.label || '' });
      setTimeout(() => {
        setFeedback(null);
        setPopId(null);
        if (currentIdx + 1 >= items.length) {
          onComplete(score + 10);
        } else {
          setCurrentIdx((i) => i + 1);
        }
      }, isTest ? 300 : 800);
    } else {
      // Wrong answer — in test mode: silently record, no visual feedback
      onAnswer?.({ correct: false, expected: current?.color || current?.label || '', given: items[idx]?.color || items[idx]?.label || '' });
    }
  };

  // ── Learning mode auto-play — speak name clearly ──────
  useEffect(() => {
    if (mode !== 'learning' || feedback) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Step 1: Play teacher audio or speak the name
      if (soundOn && current) await speakOrPlay(current.audio, speakLabel(current.label, current.color, current.emoji));
      if (cancelled) return;
      // Step 2: Highlight the correct answer
      if (soundOn) playCorrect();
      setFeedback('correct');
      setPopId(currentIdx);
      onAnswer?.({ correct: true, expected: current?.color || current?.label || '', given: current?.color || current?.label || '' });
      setTimeout(() => {
        setFeedback(null);
        setPopId(null);
        if (currentIdx + 1 >= items.length) {
          onComplete(0);
        } else {
          setCurrentIdx((i) => i + 1);
        }
      }, 1200);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, feedback, currentIdx, items, soundOn, onComplete, current, onAnswer]);

  if (!current) return null;

  return (
    <div className="space-y-6">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — Answer correctly to score
        </p>
      )}
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-700">Find:</p>
        <div className="mt-1 inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-blue-50 animate-game-float animate-game-glow-pulse">
          {current.emoji && <span className="text-3xl" role="img" aria-label={current.label || current.color}>{current.emoji}</span>}
          {current.image && <CachedImg src={current.image} alt={current.label} className="h-10 w-10 object-contain" />}
          {!current.emoji && !current.image && isHex(current.hex) && (
            <div className="h-8 w-8 rounded-full shadow-inner border-2 border-white/50" style={{ backgroundColor: current.hex }} />
          )}
          {current.emoji && isHex(current.hex) && (
            <div className="h-5 w-5 rounded-full shadow-inner border border-white/50" style={{ backgroundColor: current.hex }} />
          )}
          {readableLabel(current.label, current.color, current.emoji) && (
            <span className="text-2xl font-bold text-[#0F4D92] capitalize">{readableLabel(current.label, current.color, current.emoji)}</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {shuffle(items).map((item, i) => {
          const realIdx = items.indexOf(item);
          return (
            <button
              key={i}
              onClick={() => handleTap(realIdx)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all animate-game-drop-in stagger-${Math.min(i + 1, 12)} ${
                !isTest && feedback === 'correct' && realIdx === currentIdx
                  ? `${cbCorrect.border} ${cbCorrect.bg} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                  : popId === realIdx
                  ? `${cbCorrect.border} ${cbCorrect.bg} animate-game-spring-in`
                  : !isTest && feedback === 'wrong'
                  ? 'border-gray-200 bg-white opacity-60 scale-95'
                  : tapping === realIdx
                  ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish'
              }`}
            >
              {/* Visual: emoji + color swatch, or image, or text */}
              <div className="flex items-center justify-center">
                {item.emoji ? (
                  <span className="text-4xl" role="img" aria-label={item.label || item.color}>{item.emoji}</span>
                ) : item.image ? (
                  <CachedImg src={item.image} alt={item.label} className="h-14 w-14 object-contain" />
                ) : isHex(item.hex) ? (
                  <div
                    className={`h-14 w-14 rounded-full shadow-inner border-2 border-white/50 ${!isTest && feedback === 'correct' && realIdx === currentIdx ? 'animate-game-pulse' : ''}`}
                    style={{ backgroundColor: item.hex }}
                  />
                ) : (
                  <span className="text-2xl font-bold text-gray-700">{item.label}</span>
                )}
                {/* If has emoji AND hex, also show color swatch next to it */}
                {item.emoji && isHex(item.hex) && (
                  <div className="ml-1 h-6 w-6 rounded-full shadow-inner border border-white/50" style={{ backgroundColor: item.hex }} />
                )}
              </div>
              {/* Label — only if readable (not a hex code) */}
              {readableLabel(item.label, item.color, item.emoji) && (
                <span className="text-sm font-bold text-gray-700 capitalize">{readableLabel(item.label, item.color, item.emoji)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-center gap-1.5">
        {items.map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              i < currentIdx ? 'bg-green-400' : i === currentIdx ? 'bg-[#0F4D92] scale-125' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {/* Voice input — speak the answer instead of tapping */}
      {config.inputMode !== 'tap' && current && (
        <div className="flex justify-center">
          <SpeechInput
            expectedAnswers={[current.label || '', current.color || '', current.emoji || ''].filter(Boolean)}
            onResult={(spoken, isCorrect) => {
              if (isCorrect && !feedback) {
                const matchIdx = items.findIndex((it) => {
                  const targets = [it.label || '', it.color || '', it.emoji || ''].filter(Boolean);
                  return targets.some((t) => spoken.toLowerCase().includes(t.toLowerCase()));
                });
                if (matchIdx >= 0) handleTap(matchIdx);
              }
            }}
            disabled={!!feedback}
            compact={config.inputMode === 'both'}
            soundOn={soundOn}
          />
        </div>
      )}
    </div>
  );
}

/* ── Drag-Sort Game ────────────────────────────────────────── */

function DragSortGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const items = config.items || [];
  const hasNums = useMemo(() => items.every((item) => item.num != null && item.num > 0), [items]);
  const sortedItems = useMemo(() => {
    if (hasNums) return [...items].sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
    return [...items].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [items, hasNums]);
  const [placed, setPlaced] = useState<(typeof items)[0][]>([]);
  const [remaining, setRemaining] = useState(() => shuffle(items));
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [tapping, setTapping] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(true);
  const isTest = mode === 'test';
  const expectedNext = sortedItems[placed.length];

  const placeItem = useCallback((item: (typeof items)[0]) => {
    if (feedback) return;
    const isCorrect = item.num === expectedNext?.num;
    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(`${item.num}`);
      setTimeout(() => setTapping(null), 300);
    }
    if (isCorrect) {
      if (!isTest && soundOn) playPlace();
      if (!isTest) setFeedback('correct');
      setScore((s) => s + 10);
      onAnswer?.({ correct: true, expected: `${expectedNext.num}. ${expectedNext.label}`, given: `${item.num}. ${item.label}` });
      setTimeout(() => {
        const newPlaced = [...placed, item];
        setPlaced(newPlaced);
        setRemaining((r) => r.filter((x) => x.num !== item.num));
        setFeedback(null);
        if (newPlaced.length >= items.length) onComplete(score + 10);
      }, 500);
    } else {
      onAnswer?.({ correct: false, expected: `${expectedNext?.num}. ${expectedNext?.label}`, given: `${item.num}. ${item.label}` });
    }
  }, [feedback, isTest, soundOn, expectedNext, placed, items, score, onComplete, onAnswer]);

  const handleTap = placeItem;

  // ── HTML5 Drag-and-Drop ──────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, item: (typeof items)[0]) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'move';
    setDragging(`${item.num}`);
  };

  const handleDragEnd = () => setDragging(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const item = JSON.parse(e.dataTransfer.getData('application/json'));
      placeItem(item);
    } catch {}
  };

  const handleDragLeave = () => setDragOver(false);

  // ── Touch Drag (mobile/tablet) ────────────────────────────────────────
  const touchItemRef = useRef<string | null>(null);
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number; label: string; num: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent, item: (typeof items)[0], idx: number) => {
    const touch = e.touches[0];
    touchItemRef.current = JSON.stringify(item);
    setTouchGhost({ x: touch.clientX, y: touch.clientY, label: item.label || '', num: item.num ?? 0 });
    setDragging(`${item.num ?? idx}`);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    setTouchGhost((prev) => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setDragging(null);
    setTouchGhost(null);
    if (!touchItemRef.current) return;
    // Check if finger ended over the drop zone
    const touch = e.changedTouches[0];
    const dropEl = document.getElementById('drag-sort-drop-zone');
    if (dropEl) {
      const rect = dropEl.getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        try {
          const item = JSON.parse(touchItemRef.current);
          placeItem(item);
        } catch {}
      }
    }
    touchItemRef.current = null;
  };

  // ── Learning mode auto-play ──────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'learning' || feedback || !expectedNext) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (soundOn) await speakOrPlay(expectedNext.audio, speakLabel(expectedNext.label, undefined, expectedNext.emoji));
      if (cancelled) return;
      if (soundOn) playPlace();
      setFeedback('correct');
      onAnswer?.({ correct: true, expected: `${expectedNext.num}. ${expectedNext.label}`, given: `${expectedNext.num}. ${expectedNext.label}` });
      setTimeout(() => {
        const newPlaced = [...placed, expectedNext];
        setPlaced(newPlaced);
        setRemaining((r) => r.filter((x) => x.num !== expectedNext.num));
        setFeedback(null);
        if (newPlaced.length >= items.length) onComplete(0);
      }, 500);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, feedback, expectedNext, placed, items, soundOn, onComplete, onAnswer]);

  return (
    <div className="space-y-6 relative select-none">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — {hasNums ? 'Put them in the right order' : 'Put them in alphabetical order'}
        </p>
      )}
      <p className="text-center text-lg font-semibold text-gray-700">
        {hasNums
          ? <>Put them in order: <span className="text-[#0F4D92]">1 → {items.length}</span></>
          : <>Put them in <span className="text-[#0F4D92]">alphabetical order</span></>}
      </p>
      <p className="text-center text-xs text-gray-400">Drag words here or tap to place 👇</p>
      {/* Drop zone */}
      <div
        id="drag-sort-drop-zone"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
        className={`flex flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 min-h-[72px] transition-all duration-200 ${
          dragOver ? 'border-[#0F4D92] bg-[#0F4D92]/5 scale-[1.02]' : 'border-[#0F4D92]/20 bg-[#E7EEF6]/50'
        }`}
      >
        {placed.length === 0 && !dragOver && <span className="text-sm text-gray-400 animate-game-float-slow">Drag or tap items below</span>}
        {dragOver && placed.length === 0 && <span className="text-sm font-medium text-[#0F4D92] animate-game-pop">Drop here! 🎯</span>}
        {placed.map((item, idx) => (
          <span key={item.num} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm border animate-game-slide-up ${cbCorrect.bg} ${cbCorrect.border} ${cbCorrect.text}`} style={{ animationDelay: `${idx * 0.05}s` }}>
            {item.num}. {item.label} ✓
          </span>
        ))}
        {placed.length > 0 && (
          <div className="w-full text-center mt-1">
            <span className="text-xs font-semibold text-green-600 animate-game-bounce inline-block">{placed.length}/{items.length} placed</span>
          </div>
        )}
      </div>
      {/* Draggable items */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {remaining.map((item, i) => (
          <button
            key={`${item.num}-${i}`}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, item, i)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => handleTap(item)}
            className={`rounded-xl border-2 p-4 text-center transition-all font-semibold touch-none cursor-grab active:cursor-grabbing animate-game-zoom-in stagger-${Math.min(i + 1, 12)} ${
              !isTest && feedback === 'correct' && item.num === expectedNext?.num
                ? `${cbCorrect.border} ${cbCorrect.bg} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                : !isTest && feedback === 'wrong'
                ? 'border-gray-200 bg-white opacity-60 scale-95'
                : dragging === `${item.num}`
                ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md opacity-50 scale-95'
                : tapping === `${item.num}`
                ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish'
            }`}
          >
            <span className="text-lg">{item.label}</span>
            <div className="mt-1 text-[10px] text-gray-400">⠿ drag</div>
          </button>
        ))}
      </div>
      {/* Touch ghost (finger-dragged preview) */}
      {touchGhost && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2 font-bold text-blue-700 shadow-lg animate-game-pop"
          style={{ left: touchGhost.x - 40, top: touchGhost.y - 30 }}
        >
          {touchGhost.num}. {touchGhost.label}
        </div>
      )}
    </div>
  );
}

/* ── Fill-in-the-Blank Game (sentence completion) ────────────── */

interface BlankSlot {
  id: number;
  answer: string;
}

interface FillBlankConfig extends GameConfig {
  sentence: string;        // e.g. "The ___ is sleeping on the ___"
  blanks: BlankSlot[];     // [{ id: 0, answer: "cat" }, { id: 1, answer: "mat" }]
  wordBank: string[];      // distractors + correct words, shuffled
}

function FillBlankGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  // Multi-sentence rounds with backward-compatible single-sentence shape
  const sentences = useMemo(() => {
    if (config.sentences && config.sentences.length > 0) return config.sentences;
    if (config.sentence || (config.blanks && config.blanks.length > 0)) {
      return [{ sentence: config.sentence || '', blanks: config.blanks || [], wordBank: config.wordBank, context: config.context }];
    }
    return [];
  }, [config]);
  const [sIdx, setSIdx] = useState(0);
  const scoreRef = useRef(0);
  const currentS = sentences[sIdx];
  const blanks = currentS?.blanks || [];
  const sentence = currentS?.sentence || '';
  const wordBank = useMemo(() => shuffle(currentS?.wordBank || []), [currentS]);

  const [filledSlots, setFilledSlots] = useState<Record<number, string>>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [completed, setCompleted] = useState(false);
  const isTest = mode === 'test';

  // Words already placed
  const placedWords = useMemo(() => new Set(Object.values(filledSlots)), [filledSlots]);

  // Check if all blanks are filled
  const allFilled = blanks.every((b) => filledSlots[b.id]);

  // Parse the sentence into segments (text + blanks)
  const parts = useMemo(() => {
    const segments: { type: 'text' | 'blank'; value: string; blankId?: number }[] = [];
    let remaining = sentence;
    for (const blank of blanks) {
      const idx = remaining.indexOf('___');
      if (idx === -1) continue;
      if (idx > 0) segments.push({ type: 'text', value: remaining.slice(0, idx) });
      segments.push({ type: 'blank', value: '', blankId: blank.id });
      remaining = remaining.slice(idx + 3);
    }
    if (remaining) segments.push({ type: 'text', value: remaining });
    return segments;
  }, [sentence, blanks]);

  // Auto-check when all filled
  useEffect(() => {
    if (!allFilled || completed || feedback) return;
    // Brief delay for visual feedback
    const timer = setTimeout(() => {
      const allCorrect = blanks.every((b) => filledSlots[b.id]?.toLowerCase() === b.answer.toLowerCase());
      if (allCorrect) {
        if (!isTest && soundOn) playCorrect();
        if (!isTest) setFeedback('correct');
        blanks.forEach((b) => {
          scoreRef.current += 10;
          onAnswer?.({ correct: true, expected: b.answer, given: filledSlots[b.id] });
        });
        setTimeout(() => {
          setFeedback(null);
          setFilledSlots({});
          setSelectedWord(null);
          setCompleted(false);
          if (sIdx + 1 >= sentences.length) onComplete(scoreRef.current);
          else setSIdx((i) => i + 1);
        }, 800);
      } else {
        if (!isTest && soundOn) playWrong();
        if (!isTest) setFeedback('wrong');
        blanks.forEach((b) => {
          const given = filledSlots[b.id] || '';
          onAnswer?.({ correct: given.toLowerCase() === b.answer.toLowerCase(), expected: b.answer, given });
        });
        setTimeout(() => {
          setFeedback(null);
          setFilledSlots({});
          setSelectedWord(null);
          setCompleted(false);
        }, 1500);
      }
      setCompleted(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [allFilled, completed, feedback, blanks, filledSlots, isTest, soundOn, onComplete, onAnswer, sIdx, sentences.length]);

  // ── Tap-to-place (primary for kids) ────────────────────────────────
  const handleWordTap = (word: string) => {
    if (feedback || completed) return;
    if (placedWords.has(word)) return; // already placed
    if (soundOn) playTap();
    if (selectedWord) {
      // Deselect if same word
      setSelectedWord(null);
    } else {
      setSelectedWord(word);
    }
  };

  const handleBlankTap = (blankId: number) => {
    if (feedback || completed) return;
    if (filledSlots[blankId]) {
      // Tap filled blank to remove the word back to bank
      if (soundOn) playTap();
      setFilledSlots((prev) => {
        const next = { ...prev };
        delete next[blankId];
        return next;
      });
      return;
    }
    if (!selectedWord) return;
    if (soundOn) playPlace();
    setFilledSlots((prev) => ({ ...prev, [blankId]: selectedWord }));
    setSelectedWord(null);
  };

  // ── Drag-and-Drop for word → blank ─────────────────────────────────
  const [draggingWord, setDraggingWord] = useState<string | null>(null);
  const [dragOverBlank, setDragOverBlank] = useState<number | null>(null);

  const handleWordDragStart = (e: React.DragEvent, word: string) => {
    e.dataTransfer.setData('text/plain', word);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingWord(word);
  };

  const handleWordDragEnd = () => setDraggingWord(null);

  const handleBlankDragOver = (e: React.DragEvent, blankId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverBlank(blankId);
  };

  const handleBlankDrop = (e: React.DragEvent, blankId: number) => {
    e.preventDefault();
    setDragOverBlank(null);
    if (feedback || completed) return;
    const word = e.dataTransfer.getData('text/plain');
    if (!word) return;
    if (soundOn) playPlace();
    setFilledSlots((prev) => ({ ...prev, [blankId]: word }));
  };

  // ── Touch drag for word → blank (mobile) ─────────────────────────────
  const touchWordRef = useRef<string | null>(null);
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number; word: string } | null>(null);

  const handleWordTouchStart = (e: React.TouchEvent, word: string) => {
    const touch = e.touches[0];
    touchWordRef.current = word;
    setTouchGhost({ x: touch.clientX, y: touch.clientY, word });
    setDraggingWord(word);
  };

  const handleWordTouchMove = (e: React.TouchEvent) => {
    if (!touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    setTouchGhost((prev) => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
  };

  const handleWordTouchEnd = (e: React.TouchEvent) => {
    setDraggingWord(null);
    setTouchGhost(null);
    if (!touchWordRef.current) return;
    const touch = e.changedTouches[0];
    // Find which blank slot the finger ended over
    for (const blank of blanks) {
      const el = document.getElementById(`blank-slot-${blank.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          if (!filledSlots[blank.id] && !feedback && !completed) {
            if (soundOn) playPlace();
            setFilledSlots((prev) => ({ ...prev, [blank.id]: touchWordRef.current! }));
          }
          break;
        }
      }
    }
    touchWordRef.current = null;
  };

  // ── Learning mode auto-play ──────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'learning' || feedback || completed) return;
    let cancelled = false;
    // Fill in blanks one by one with delay
    const unfilledBlanks = blanks.filter((b) => !filledSlots[b.id]);
    if (unfilledBlanks.length === 0) return;
    const nextBlank = unfilledBlanks[0];
    const timer = setTimeout(async () => {
      if (soundOn) await speak(nextBlank.answer);
      if (cancelled) return;
      if (soundOn) playPlace();
      setFilledSlots((prev) => ({ ...prev, [nextBlank.id]: nextBlank.answer }));
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, feedback, completed, blanks, filledSlots, soundOn]);

  if (sentences.length === 0 || !currentS) {
    return <p className="text-center text-gray-500">No fill-in-the-blank data available.</p>;
  }

  return (
    <div className="space-y-6 relative select-none">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — Fill in the blanks correctly
        </p>
      )}
      {sentences.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {sentences.map((_, i) => (
            <div
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i < sIdx ? 'bg-green-400' : i === sIdx ? 'bg-[#0F4D92] scale-125' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}
      <p className="text-center text-lg font-semibold text-gray-700">Complete the sentence 📝</p>
      {(currentS.context || sentences.length > 1) && (
        <p className="text-center text-sm text-gray-500">
          {sentences.length > 1 ? `Sentence ${sIdx + 1} of ${sentences.length}` : ''}
          {currentS.context ? `${sentences.length > 1 ? ' — ' : ''}${currentS.context}` : ''}
        </p>
      )}
      <p className="text-center text-xs text-gray-400">Tap a word, then tap a blank — or drag it!</p>
      {/* Sentence with blank slots */}
      <div className="rounded-2xl bg-white p-6 shadow-md border border-gray-100">
        <div className="flex flex-wrap items-center gap-2 text-xl font-kid-body leading-relaxed">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i} className="text-gray-800">{part.value}</span>;
            }
            // Blank slot
            const blankId = part.blankId!;
            const filled = filledSlots[blankId];
            const isTarget = dragOverBlank === blankId;
            const isCorrectHere = feedback === 'correct' && filled;
            const isWrongHere = feedback === 'wrong';
            return (
              <span
                key={`blank-${blankId}`}
                id={`blank-slot-${blankId}`}
                onClick={() => handleBlankTap(blankId)}
                onDragOver={(e) => handleBlankDragOver(e, blankId)}
                onDrop={(e) => handleBlankDrop(e, blankId)}
                onDragLeave={() => setDragOverBlank(null)}
                className={`inline-flex items-center justify-center min-w-[80px] h-10 rounded-xl border-2 border-dashed px-3 font-bold transition-all duration-200 ${
                  filled
                    ? isCorrectHere
                      ? `${cbCorrect.border} ${cbCorrect.bg} text-green-700`
                      : isWrongHere
                      ? 'border-red-300 bg-red-50 text-red-700 line-through'
                      : 'border-[#0F4D92] bg-[#0F4D92]/5 text-[#0F4D92]'
                    : isTarget
                    ? 'border-blue-400 bg-blue-50 scale-105'
                    : 'border-gray-300 bg-gray-50 text-gray-400'
                }`}
              >
                {filled || '___'}
              </span>
            );
          })}
        </div>
      </div>
      {/* Word bank */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
        <p className="mb-3 text-xs font-medium text-gray-400 text-center">Word Bank</p>
        <div className="flex flex-wrap justify-center gap-2">
          {wordBank.map((word, i) => {
            const isPlaced = placedWords.has(word);
            const isSelected = selectedWord === word;
            return (
              <button
                key={`word-${i}`}
                draggable={!isPlaced}
                onDragStart={(e) => handleWordDragStart(e, word)}
                onDragEnd={handleWordDragEnd}
                onTouchStart={(e) => handleWordTouchStart(e, word)}
                onTouchMove={handleWordTouchMove}
                onTouchEnd={handleWordTouchEnd}
                onClick={() => handleWordTap(word)}
                disabled={isPlaced}
                className={`rounded-xl border-2 px-4 py-2.5 text-base font-bold transition-all touch-none ${
                  isPlaced
                    ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md animate-game-jelly scale-105'
                    : draggingWord === word
                    ? 'border-blue-400 bg-blue-50 opacity-50 scale-95'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:shadow-md hover:animate-game-squish cursor-grab active:cursor-grabbing'
                }`}
              >
                {word}
              </button>
            );
          })}
        </div>
      </div>
      {/* Voice input — speak a word to fill a blank */}
      {config.inputMode !== 'tap' && !allFilled && (
        <div className="flex justify-center">
          <SpeechInput
            expectedAnswers={blanks.filter((b) => !filledSlots[b.id]).map((b) => b.answer)}
            onResult={(spoken, isCorrect) => {
              if (!isCorrect || feedback || completed) return;
              // Find the first unfilled blank and fill it with the spoken word
              const targetBlank = blanks.find((b) => !filledSlots[b.id]);
              if (targetBlank) {
                if (soundOn) playPlace();
                setFilledSlots((prev) => ({ ...prev, [targetBlank.id]: spoken }));
              }
            }}
            disabled={!!feedback || completed}
            compact={config.inputMode === 'both'}
            soundOn={soundOn}
          />
        </div>
      )}
      {/* Touch ghost */}
      {touchGhost && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2 font-bold text-blue-700 shadow-lg animate-game-pop"
          style={{ left: touchGhost.x - 40, top: touchGhost.y - 30 }}
        >
          {touchGhost.word}
        </div>
      )}
      {/* Feedback overlay */}
      {feedback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10 animate-game-pop">
          <div className={`rounded-2xl px-8 py-6 text-center shadow-xl ${
            feedback === 'correct' ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'
          }`}>
            <span className="text-4xl block mb-2">{feedback === 'correct' ? '✅' : '❌'}</span>
            <p className="text-lg font-bold">
              {feedback === 'correct' ? 'Perfect!' : 'Try again!'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Quiz Game ─────────────────────────────────────────────── */

function QuizGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  // Multi-question quiz (>=5 questions) with backward-compatible single-question shape
  const questions = useMemo(() => {
    if (config.questions && config.questions.length > 0) return config.questions;
    return [{
      id: 'q-single',
      prompt: config.question || 'Choose the correct answer',
      options: config.options || [],
      correctIndex: -1,
      correctId: config.correctId,
      answer: config.answer,
    }];
  }, [config]);
  const [qIdx, setQIdx] = useState(0);
  const scoreRef = useRef(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [tapping, setTapping] = useState<number | null>(null);
  const isTest = mode === 'test';
  const currentQ = questions[qIdx];
  const options = currentQ?.options || [];

  const isCorrectOption = useCallback((idx: number): boolean => {
    const opt = options[idx];
    if (!opt) return false;
    if (typeof currentQ?.correctIndex === 'number' && currentQ.correctIndex >= 0) return idx === currentQ.correctIndex;
    return opt.id === currentQ?.correctId || opt.label === currentQ?.answer;
  }, [options, currentQ]);

  const advance = useCallback((totalScore: number) => {
    setSelectedIdx(null);
    setFeedback(null);
    setTapping(null);
    if (qIdx + 1 >= questions.length) {
      onComplete(totalScore);
    } else {
      setQIdx((i) => i + 1);
    }
  }, [qIdx, questions.length, onComplete]);

  const handleAnswer = (idx: number) => {
    if (feedback) return;
    const isCorrect = isCorrectOption(idx);
    // In test mode: no sound, no tapping animation, no selection highlight for wrong answers
    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(idx);
      setTimeout(() => setTapping(null), 300);
    }
    onAnswer?.({ correct: isCorrect, expected: currentQ?.answer || currentQ?.correctId || options[currentQ?.correctIndex ?? -1]?.label || '', given: options[idx]?.label || '' });

    if (isCorrect) {
      if (!isTest && soundOn) playCorrect();
      if (!isTest) setFeedback('correct');
      setSelectedIdx(idx);
      scoreRef.current += 10;
      setTimeout(() => advance(scoreRef.current), isTest ? 200 : 800);
    } else if (!isTest) {
      // Wrong answer in practice — brief shake then retry
      setFeedback('wrong');
      setSelectedIdx(idx);
      setTimeout(() => { setFeedback(null); setSelectedIdx(null); }, 600);
    }
    // Wrong answer in test mode — silently record, no visual feedback
  };

  // ── Learning mode auto-play — speak question + answer per round ──
  useEffect(() => {
    if (mode !== 'learning' || !currentQ) return;
    const correctIdx = options.findIndex((_, i) => isCorrectOption(i));
    if (correctIdx === -1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Step 1: Read the question
      if (soundOn) await speak(stripEmoji(currentQ.prompt || currentQ.question || 'Choose the correct answer'));
      if (cancelled) return;
      // Step 2: Highlight + play teacher audio or speak the answer
      if (soundOn) playCorrect();
      setFeedback('correct');
      setSelectedIdx(correctIdx);
      onAnswer?.({ correct: true, expected: options[correctIdx]?.label || '', given: options[correctIdx]?.label || '' });
      const answerName = speakLabel(options[correctIdx]?.label, undefined, options[correctIdx]?.emoji);
      if (soundOn) await speakOrPlay(options[correctIdx]?.audio, `The answer is ${answerName}`);
      if (cancelled) return;
      setTimeout(() => advance(scoreRef.current), 600);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, qIdx, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentQ) return null;

  return (
    <div className="space-y-6">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — Choose carefully
        </p>
      )}
      {questions.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i < qIdx ? 'bg-green-400' : i === qIdx ? 'bg-[#0F4D92] scale-125' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}
      <p className="text-center text-xl font-semibold text-gray-700 animate-game-drop-in">
        {currentQ.prompt || currentQ.question || 'Choose the correct answer'}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            className={`rounded-xl border-2 p-5 text-center font-semibold transition-all animate-game-slide-up stagger-${Math.min(i + 1, 12)} ${
              !isTest && feedback === 'correct' && isCorrectOption(i)
                ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                : !isTest && selectedIdx === i && feedback === 'wrong'
                ? `${cbWrong.border} ${cbWrong.bg} animate-game-wrong`
                : !isTest && feedback === 'wrong'
                ? 'border-gray-200 bg-white opacity-60 scale-95'
                : tapping === i
                ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish'
            }`}
          >
            {opt.image && <CachedImg src={opt.image} alt={opt.label} className="mx-auto mb-2 h-12 w-12 object-contain" />}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
      {/* Voice input — speak the answer instead of tapping */}
      {config.inputMode !== 'tap' && (
        <div className="flex justify-center">
          <SpeechInput
            expectedAnswers={options.map((o) => o.label).filter(Boolean)}
            onResult={(spoken, isCorrect) => {
              if (isCorrect && !feedback) {
                const matchIdx = options.findIndex((o) =>
                  o.label.toLowerCase().includes(spoken.toLowerCase()) ||
                  spoken.toLowerCase().includes(o.label.toLowerCase())
                );
                if (matchIdx >= 0) handleAnswer(matchIdx);
              }
            }}
            disabled={!!feedback}
            compact={config.inputMode === 'both'}
            soundOn={soundOn}
          />
        </div>
      )}
    </div>
  );
}

/* ── Mode Selector Screen ──────────────────────────────────── */

/* ── Waiting for Submit (Test Mode) ─────────────────────── */

function WaitingSubmit({
  score,
  totalAnswered,
  totalPossible,
  onSubmit,
  onBack,
}: {
  score: number;
  totalAnswered: number;
  totalPossible: number;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 mx-auto animate-game-trophy-drop">
          <span className="text-4xl">📝</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800 animate-game-slide-up stagger-1">Test Complete!</h1>
        <p className="mb-6 text-sm text-gray-500 animate-game-slide-up stagger-2">Ready to submit your answers?</p>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md animate-game-slide-up stagger-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#0F4D92]">{totalAnswered}</p>
              <p className="text-xs text-gray-500">Answered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{totalPossible}</p>
              <p className="text-xs text-gray-500">Total Questions</p>
            </div>
          </div>
          {totalAnswered < totalPossible && (
            <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg py-1.5">
              ⚠️ {totalPossible - totalAnswered} question{totalPossible - totalAnswered > 1 ? 's' : ''} unanswered
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center animate-game-slide-up stagger-4">
          <button
            onClick={() => { playTap(); onSubmit(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 animate-game-spring-in stagger-4"
          >
            Submit Test ✓
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all animate-game-spring-in stagger-5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Result Breakdown ──────────────────────────────────────── */

function ResultBreakdown({
  answers,
  score,
  totalPossible,
  mode,
  onRestart,
  onBack,
}: {
  answers: AnswerResult[];
  score: number;
  totalPossible: number;
  mode: GameMode;
  onRestart: () => void;
  onBack: () => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const correct = answers.filter((a) => a.correct).length;
  const wrong = answers.filter((a) => !a.correct).length;
  const pct = totalPossible > 0 ? Math.round((correct / totalPossible) * 100) : 0;
  const stars = pct >= 80 ? 3 : pct >= 50 ? 2 : pct > 0 ? 1 : 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6">
      <div className="w-full max-w-md text-center">
        {pct >= 50 && <div className="confetti-container"><div className="confetti-particle" style={{ left: '10%', backgroundColor: '#FFD700', animationDelay: '0.1s' }} /><div className="confetti-particle" style={{ left: '25%', backgroundColor: '#FF6B6B', animationDelay: '0.3s' }} /><div className="confetti-particle" style={{ left: '50%', backgroundColor: '#4ECDC4', animationDelay: '0.2s' }} /><div className="confetti-particle" style={{ left: '75%', backgroundColor: '#A78BFA', animationDelay: '0.4s' }} /><div className="confetti-particle" style={{ left: '90%', backgroundColor: '#F59E0B', animationDelay: '0.15s' }} /></div>}
        <Trophy className="mx-auto mb-4 h-16 w-16 text-amber-400 animate-game-trophy-drop" />
        <h1 className="mb-1 text-3xl font-bold text-gray-800 animate-game-spring-in">
          {pct >= 80 ? '⭐ SUPER STAR! ⭐' : pct >= 50 ? '🎉 Great Job!' : pct > 0 ? '💪 Keep Trying!' : '⏰ Time\'s Up!'}
        </h1>
        {pct >= 80 && (
          <p className="mb-2 animate-game-pop text-xl font-extrabold tracking-wide text-amber-500">
            YOU ARE A SUPER STAR!
          </p>
        )}
        <p className="mb-4 text-gray-500 animate-game-slide-up stagger-1">
          {mode === 'test' ? 'Test Results' : 'Practice Results'}
        </p>

        {/* Stars */}
        <div className="my-4 flex items-center justify-center gap-3">
          {[1, 2, 3].map((s) => (
            <Star
              key={s}
              className={`h-12 w-12 ${s <= stars ? 'fill-amber-400 text-amber-400 animate-game-star-spin' : 'text-gray-300'}`}
              style={{ animationDelay: `${s * 0.2}s` }}
            />
          ))}
        </div>

        {/* Score card */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md animate-game-slide-up stagger-3">
          <p className="mb-3 text-4xl font-bold text-[#0F4D92] animate-game-score-bounce">+{score} XP</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className={`text-2xl font-bold ${cbCorrect.text}`}>{correct}</p>
              <p className="text-xs text-gray-500">Correct</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${cbWrong.text}`}>{wrong}</p>
              <p className="text-xs text-gray-500">Wrong</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{pct}%</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
          </div>
        </div>

        {/* Answer review (test mode only) */}
        {mode === 'test' && answers.length > 0 && (
          <div className="mb-6 text-left animate-game-slide-up stagger-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-600">Answer Review</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl bg-white p-3 shadow-sm">
              {answers.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm animate-game-slide-up stagger-${Math.min(i + 6, 12)} ${a.correct ? cbCorrect.text : cbWrong.text}`}>
                  {a.correct
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 animate-game-pop" />
                    : <XCircle className="h-4 w-4 shrink-0 animate-game-pop" />
                  }
                  <span className="truncate">
                    {a.correct ? a.expected : `Yours: ${a.given} → Correct: ${a.expected}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-center animate-game-slide-up stagger-6">
          <button
            onClick={() => { playTap(); onRestart(); }}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[#0F4D92]/20 px-5 py-2.5 text-sm font-semibold text-[#0F4D92] hover:bg-[#0F4D92]/5 transition-all hover:scale-105 hover:animate-game-squish active:scale-95"
          >
            <RotateCcw className="h-4 w-4" /> Play Again
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 hover:animate-game-squish active:scale-95"
          >
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Learning Complete Screen ──────────────────────────────── */

function LearningComplete({
  lessonTitle,
  totalItems,
  onRestart,
  onBack,
}: {
  lessonTitle: string;
  totalItems: number;
  onRestart: () => void;
  onBack: () => void;
}) {
  // Speak completion message on mount
  useEffect(() => {
    speakComplete(0).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-purple-50 to-white px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 mx-auto animate-game-trophy-drop">
          <span className="text-4xl">📺</span>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-gray-800 animate-game-spring-in">⭐ SUPER STAR! ⭐</h1>
        <p className="mb-1 animate-game-pop text-xl font-extrabold tracking-wide text-amber-500">
          YOU ARE A SUPER STAR!
        </p>
        <p className="mb-6 text-sm text-gray-500 animate-game-slide-up stagger-1">
          You watched <span className="font-semibold text-purple-700">{lessonTitle}</span> and learned {totalItems} items.
        </p>
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md animate-game-slide-up stagger-2">
          <p className="text-sm text-gray-600">
            🌟 Great job watching! Now try <span className="font-bold text-green-700">Practice Mode</span> to test yourself,
            or <span className="font-bold text-blue-700">Test Mode</span> to earn stars and XP!
          </p>
        </div>
        <div className="flex gap-3 justify-center animate-game-slide-up stagger-3">
          <button
            onClick={() => { playTap(); onRestart(); }}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 transition-all hover:scale-105 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" /> Watch Again
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 active:scale-95"
          >
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Puzzle Game (image split → reassemble) ────────────────── */

const DIFFICULTY_META: Record<string, { label: string; emoji: string; color: string }> = {
  easy:   { label: 'Easy',   emoji: '⭐',       color: 'border-green-300 bg-green-50 text-green-700' },
  medium: { label: 'Medium', emoji: '⭐⭐',     color: 'border-blue-300 bg-blue-50 text-blue-700' },
  hard:   { label: 'Hard',   emoji: '⭐⭐⭐',   color: 'border-orange-300 bg-orange-50 text-orange-700' },
  expert: { label: 'Expert', emoji: '⭐⭐⭐⭐', color: 'border-red-300 bg-red-50 text-red-700' },
};

function PuzzleGame({
  config, onComplete, soundOn, mode, onAnswer, onDifficultyChange,
}: {
  config: GameConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
  onDifficultyChange?: (difficulty: string) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');

  const difficulties = config.difficulties || {};
  const hasLevels = Object.keys(difficulties).length > 1;

  // Pick difficulty: auto-select based on age level, or let user choose
  const defaultDifficulty = useMemo(() => {
    const age = config.ageLevel || 'KG1';
    if (age === 'Creche' || age === 'Nursery') return 'easy';
    if (age === 'KG1') return 'easy';
    if (age === 'KG2') return 'medium';
    return 'hard';
  }, [config.ageLevel]);

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(defaultDifficulty);
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(!hasLevels || mode === 'learning');
  const [difficultyLocks, setDifficultyLocks] = useState<Record<string, { passed: boolean; best_score?: number; stars?: number }>>({});
  const [unlockedLevels, setUnlockedLevels] = useState<Record<string, boolean>>({ easy: true });
  const lessonId = config.lessonId || '';

  // Fetch difficulty lock status on mount
  useEffect(() => {
    if (!hasLevels || !lessonId || mode === 'learning') return;
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    let admissionNo = '';
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      admissionNo = decoded.admission_no || decoded.id || '';
    } catch {}
    if (!admissionNo) return;

    apiClient.get(ENDPOINTS.PROGRESS.PUZZLE_DIFFICULTY(admissionNo, lessonId))
      .then((res) => {
        const data = res.data?.data;
        if (data?.completed) setDifficultyLocks(data.completed);
        if (data?.unlocked) setUnlockedLevels(data.unlocked);
      })
      .catch(() => {});
  }, [hasLevels, lessonId, mode]);

  // Load pieces for the selected difficulty
  const activeLevel = difficulties[selectedDifficulty];
  const pieces = activeLevel?.pieces || config.pieces || [];
  const grid = activeLevel?.grid || config.grid || { rows: 3, cols: 3 };
  const pieceSize = activeLevel?.pieceSize || config.pieceSize || { width: 120, height: 120 };
  const isTest = mode === 'test';
  const totalPieces = pieces.length;

  // Track placed pieces: slot index → piece id
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [completed, setCompleted] = useState(false);
  const [celebrateSlot, setCelebrateSlot] = useState<number | null>(null);

  const placedCount = Object.keys(placed).length;
  const allPlaced = placedCount >= totalPieces;

  // Piece IDs placed
  const placedSet = useMemo(() => new Set(Object.values(placed)), [placed]);

  // Shuffled pieces for the bank
  const shuffledPieces = useMemo(() => {
    const arr = [...pieces];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [pieces]);

  // Check correctness when all placed
  useEffect(() => {
    if (!allPlaced || completed || feedback) return;
    const timer = setTimeout(() => {
      const correct = Object.entries(placed).every(([slotIdx, pieceId]) => {
        const piece = pieces.find((p) => p.id === pieceId);
        const slotRow = Math.floor(parseInt(slotIdx) / grid.cols);
        const slotCol = parseInt(slotIdx) % grid.cols;
        return piece && piece.row === slotRow && piece.col === slotCol;
      });
      if (correct) {
        if (!isTest && soundOn) playCorrect();
        if (!isTest) setFeedback('correct');
        const pts = totalPieces * 10;
        setScore(pts);
        pieces.forEach((p) => onAnswer?.({ correct: true, expected: `row ${p.row} col ${p.col}`, given: p.id }));
        setTimeout(() => onComplete(pts), 1000);
      } else {
        if (!isTest && soundOn) playWrong();
        if (!isTest) setFeedback('wrong');
        // Count correct placements
        let correctCount = 0;
        Object.entries(placed).forEach(([slotIdx, pieceId]) => {
          const piece = pieces.find((p) => p.id === pieceId);
          const slotRow = Math.floor(parseInt(slotIdx) / grid.cols);
          const slotCol = parseInt(slotIdx) % grid.cols;
          const isCorrect = !!(piece && piece.row === slotRow && piece.col === slotCol);
          if (isCorrect) correctCount++;
          onAnswer?.({
            correct: isCorrect,
            expected: `row ${piece?.row} col ${piece?.col}`,
            given: `slot ${slotIdx}`,
          });
        });
        const pts = correctCount * 10;
        setScore(pts);
        setTimeout(() => {
          setFeedback(null);
          setPlaced({});
          setCompleted(false);
        }, 1500);
      }
      setCompleted(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [allPlaced, completed, feedback, placed, pieces, grid, totalPieces, isTest, soundOn, onComplete, onAnswer]);

  // Tap-to-place
  const handlePieceTap = (pieceId: string) => {
    if (feedback || completed) return;
    if (placedSet.has(pieceId)) return;
    if (soundOn) playTap();
    if (selectedPiece === pieceId) {
      setSelectedPiece(null);
    } else {
      setSelectedPiece(pieceId);
    }
  };

  const handleSlotTap = (slotIdx: number) => {
    if (feedback || completed) return;
    if (placed[slotIdx]) {
      // Tap filled slot to remove
      if (soundOn) playTap();
      setPlaced((prev) => {
        const next = { ...prev };
        delete next[slotIdx];
        return next;
      });
      return;
    }
    if (!selectedPiece) return;
    if (soundOn) playPlace();
    setPlaced((prev) => ({ ...prev, [slotIdx]: selectedPiece }));
    setSelectedPiece(null);
  };

  // Drag-and-drop
  const [draggingPiece, setDraggingPiece] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const handlePieceDragStart = (e: React.DragEvent, pieceId: string) => {
    e.dataTransfer.setData('text/plain', pieceId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPiece(pieceId);
  };

  const handlePieceDragEnd = () => setDraggingPiece(null);

  const handleSlotDragOver = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slotIdx);
  };

  const handleSlotDrop = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    if (feedback || completed) return;
    const pieceId = e.dataTransfer.getData('text/plain');
    if (!pieceId) return;
    if (soundOn) playPlace();
    setPlaced((prev) => ({ ...prev, [slotIdx]: pieceId }));
  };

  // Touch drag
  const touchPieceRef = useRef<string | null>(null);
  const [touchGhost, setTouchGhost] = useState<{ x: number; y: number; pieceId: string } | null>(null);

  const handlePieceTouchStart = (e: React.TouchEvent, pieceId: string) => {
    const touch = e.touches[0];
    touchPieceRef.current = pieceId;
    setTouchGhost({ x: touch.clientX, y: touch.clientY, pieceId });
    setDraggingPiece(pieceId);
  };
  const handlePieceTouchMove = (e: React.TouchEvent) => {
    if (!touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    setTouchGhost((prev) => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
  };
  const handlePieceTouchEnd = (e: React.TouchEvent) => {
    setDraggingPiece(null);
    setTouchGhost(null);
    if (!touchPieceRef.current) return;
    const touch = e.changedTouches[0];
    for (let i = 0; i < totalPieces; i++) {
      const el = document.getElementById(`puzzle-slot-${i}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          if (!placed[i] && !feedback && !completed) {
            if (soundOn) playPlace();
            setPlaced((prev) => ({ ...prev, [i]: touchPieceRef.current! }));
          }
          break;
        }
      }
    }
    touchPieceRef.current = null;
  };

  // Learning mode auto-play
  useEffect(() => {
    if (mode !== 'learning' || feedback || completed) return;
    let cancelled = false;
    const unfilledSlots = Array.from({ length: totalPieces }, (_, i) => i).filter((i) => !placed[i]);
    if (unfilledSlots.length === 0) return;
    const nextSlot = unfilledSlots[0];
    const correctPiece = pieces.find((p) => p.row === Math.floor(nextSlot / grid.cols) && p.col === nextSlot % grid.cols);
    if (!correctPiece) return;
    const timer = setTimeout(async () => {
      if (soundOn) await speak(`Row ${correctPiece.row + 1}, Column ${correctPiece.col + 1}`);
      if (cancelled) return;
      if (soundOn) playPlace();
      setPlaced((prev) => ({ ...prev, [nextSlot]: correctPiece.id }));
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, feedback, completed, placed, pieces, grid, totalPieces, soundOn]);

  const handleDifficultyChange = (diff: string) => {
    if (soundOn) playTap();
    setSelectedDifficulty(diff);
    onDifficultyChange?.(diff);
    setPlaced({});
    setSelectedPiece(null);
    setFeedback(null);
    setCompleted(false);
    setScore(0);
  };

  // Difficulty picker
  if (showDifficultyPicker && hasLevels && mode !== 'learning') {
    return (
      <div className="space-y-6">
        <p className="text-center text-lg font-semibold text-gray-700">Choose Puzzle Difficulty 🧩</p>
        <p className="text-center text-xs text-gray-400">Harder = more pieces!</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(difficulties).map(([key, level]) => {
            const meta = DIFFICULTY_META[key] || DIFFICULTY_META.medium;
            const pieceCount = level.pieces.length;
            const isSelected = selectedDifficulty === key;
            const isLocked = !unlockedLevels[key];
            const isCompleted = difficultyLocks[key]?.passed;
            return (
              <button
                key={key}
                onClick={() => {
                  if (isLocked) { if (soundOn) playWrong(); return; }
                  handleDifficultyChange(key);
                  setShowDifficultyPicker(false);
                }}
                disabled={isLocked}
                className={`relative rounded-2xl border-2 p-5 text-left transition-all animate-game-slide-up ${
                  isLocked
                    ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                    : isSelected
                    ? `${meta.color} shadow-md`
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:animate-game-squish'
                }`}
              >
                {/* Lock overlay */}
                {isLocked && (
                  <div className="absolute top-3 right-3 text-lg">🔒</div>
                )}
                {/* Completed checkmark */}
                {isCompleted && !isLocked && (
                  <div className="absolute top-3 right-3 text-lg">✅</div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{meta.emoji}</span>
                  <span className="font-bold text-sm">{meta.label}</span>
                </div>
                <p className="text-xs text-gray-500">{level.grid.rows}×{level.grid.cols} grid — {pieceCount} pieces</p>
                {isLocked ? (
                  <p className="text-[10px] text-orange-500 mt-1 font-medium">🔒 Pass {DIFFICULTY_META[Object.keys(DIFFICULTY_META)[Math.max(0, Object.keys(DIFFICULTY_META).indexOf(key) - 1)]]?.label || 'previous level'} to unlock</p>
                ) : isCompleted ? (
                  <p className="text-[10px] text-green-500 mt-1 font-medium">✅ Completed! Best: {difficultyLocks[key]?.best_score || 0} pts</p>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-1">Best for: {level.minAge}+</p>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { playTap(); handleDifficultyChange(selectedDifficulty); setShowDifficultyPicker(false); }}
          className="w-full rounded-xl bg-[#0F4D92] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#0D3F7A] transition-all hover:scale-105 active:scale-95"
        >
          Start Puzzle! 🧩
        </button>
      </div>
    );
  }

  if (pieces.length === 0) {
    return <p className="text-center text-gray-500">No puzzle data available.</p>;
  }

  const diffMeta = DIFFICULTY_META[selectedDifficulty] || DIFFICULTY_META.medium;

  return (
    <div className="space-y-4 relative select-none">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 Learning Mode — Watch and learn!
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ Test Mode — Solve the puzzle!
        </p>
      )}
      <div className="flex items-center justify-center gap-3">
        <p className="text-lg font-semibold text-gray-700">Solve the puzzle! 🧩</p>
        {hasLevels && (
          <button
            onClick={() => { playTap(); setShowDifficultyPicker(true); }}
            className={`rounded-xl border px-3 py-1 text-xs font-semibold transition-all ${diffMeta.color} hover:shadow-md`}
          >
            {diffMeta.emoji} {diffMeta.label}
          </button>
        )}
      </div>
      <p className="text-center text-xs text-gray-400">Drag pieces to the grid or tap to place — {grid.rows}×{grid.cols} ({totalPieces} pieces)</p>
      {/* Progress */}
      <div className="text-center">
        <span className="text-sm font-semibold text-green-600">{placedCount}/{totalPieces} placed</span>
      </div>
      {/* Puzzle grid (drop zone) */}
      <div
        className="inline-grid mx-auto gap-1 p-2 rounded-2xl bg-white shadow-md border border-gray-100"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, ${pieceSize.width}px)` }}
      >
        {Array.from({ length: totalPieces }, (_, i) => {
          const pieceId = placed[i];
          const piece = pieceId ? pieces.find((p) => p.id === pieceId) : null;
          const isCorrectHere = piece && piece.row === Math.floor(i / grid.cols) && piece.col === i % grid.cols;
          const isTarget = dragOverSlot === i;
          return (
            <div
              key={i}
              id={`puzzle-slot-${i}`}
              onClick={() => handleSlotTap(i)}
              onDragOver={(e) => handleSlotDragOver(e, i)}
              onDrop={(e) => handleSlotDrop(e, i)}
              onDragLeave={() => setDragOverSlot(null)}
              className={`rounded-lg overflow-hidden transition-all duration-200 cursor-pointer ${
                piece
                  ? feedback === 'correct' && isCorrectHere
                    ? `ring-2 ring-green-400 ring-offset-1`
                    : feedback === 'wrong' && !isCorrectHere
                    ? `ring-2 ring-red-300 opacity-80`
                    : `shadow-sm`
                  : isTarget
                  ? `ring-2 ring-blue-400 bg-blue-50 scale-105`
                  : `border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300`
              }`}
              style={{ width: pieceSize.width, height: pieceSize.height }}
            >
              {piece ? (
                <CachedImg src={piece.imageUrl} alt="" className="w-full h-full object-cover rounded-lg animate-game-pop" draggable={false} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                  {Math.floor(i / grid.cols) + 1},{(i % grid.cols) + 1}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Piece bank */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
        <p className="mb-3 text-xs font-medium text-gray-400 text-center">Piece Bank — drag to grid</p>
        <div className="flex flex-wrap justify-center gap-2">
          {shuffledPieces.map((piece) => {
            const isPlaced = placedSet.has(piece.id);
            const isSelected = selectedPiece === piece.id;
            return (
              <div
                key={piece.id}
                draggable={!isPlaced}
                onDragStart={(e) => handlePieceDragStart(e, piece.id)}
                onDragEnd={handlePieceDragEnd}
                onTouchStart={(e) => handlePieceTouchStart(e, piece.id)}
                onTouchMove={handlePieceTouchMove}
                onTouchEnd={handlePieceTouchEnd}
                onClick={() => handlePieceTap(piece.id)}
                className={`rounded-lg overflow-hidden cursor-grab active:cursor-grabbing touch-none transition-all ${
                  isPlaced
                    ? 'opacity-30 scale-90 grayscale cursor-not-allowed'
                    : isSelected
                    ? 'ring-2 ring-blue-500 shadow-md scale-105 animate-game-jelly'
                    : draggingPiece === piece.id
                    ? 'opacity-50 scale-95'
                    : 'shadow-sm hover:shadow-md hover:scale-105 hover:animate-game-squish'
                }`}
                style={{ width: Math.min(pieceSize.width, 80), height: Math.min(pieceSize.height, 80) }}
              >
                <CachedImg src={piece.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
              </div>
            );
          })}
        </div>
      </div>
      {/* Touch ghost */}
      {touchGhost && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border-2 border-blue-400 shadow-lg animate-game-pop opacity-80"
          style={{ left: touchGhost.x - 30, top: touchGhost.y - 30, width: 60, height: 60 }}
        >
          {(() => {
            const p = pieces.find((pp) => pp.id === touchGhost.pieceId);
            return p ? <CachedImg src={p.imageUrl} alt="" className="w-full h-full object-cover rounded-lg" /> : null;
          })()}
        </div>
      )}
      {/* Feedback overlay */}
      {feedback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10 animate-game-pop">
          <div className={`rounded-2xl px-8 py-6 text-center shadow-xl ${
            feedback === 'correct' ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'
          }`}>
            <span className="text-4xl block mb-2">{feedback === 'correct' ? '🧩✅' : '🧩❌'}</span>
            <p className="text-lg font-bold">
              {feedback === 'correct' ? 'Perfect puzzle!' : 'Try again!'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main GamePlay Page ────────────────────────────────────── */

export default function GamePlay() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMode = (searchParams.get('mode') || '').toLowerCase();
  const validUrlMode = (['learning', 'practice', 'test'] as string[]).includes(urlMode) ? urlMode as GameMode : null;
  // Restore last-used mode from localStorage, or use URL param, or default to practice
  const savedModeKey = lessonId ? `kids_mode_${lessonId}` : '';
  const savedMode = savedModeKey ? (localStorage.getItem(savedModeKey) as GameMode | null) : null;
  const [phase, setPhase] = useState<Phase>(validUrlMode ? 'play' : 'play');
  const [mode, setMode] = useState<GameMode>(validUrlMode || savedMode || 'practice');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [scenes, setScenes] = useState<SceneWrapper[]>([]);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [sceneSpeaking, setSceneSpeaking] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const [scoreBounce, setScoreBounce] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [showBreakSuggestion, setShowBreakSuggestion] = useState(false);
  const [breakDismissed, setBreakDismissed] = useState(false);
  const [puzzleDifficulty, setPuzzleDifficulty] = useState<string>('easy');
  const sessionStartRef = useRef(Date.now());
  const { colorblindMode, toggleColorblind } = useA11yStore();

  // Mode lock state (Teacher > Parent > Child hierarchy)
  const [modeLock, setModeLock] = useState<{ locked_mode: string; locked_by_role: string; locked_by_name?: string; class_code?: string } | null>(null);
  const [modeLocked, setModeLocked] = useState(false);

  // Persist mode to localStorage per lesson (so next visit remembers)
  useEffect(() => {
    if (lessonId && mode) {
      try { localStorage.setItem(`kids_mode_${lessonId}`, mode); } catch {}
    }
  }, [mode, lessonId]);
  const isModeLocked = modeLocked;

  // Trigger score bounce on change
  useEffect(() => {
    if (score > 0) {
      setScoreBounce(true);
      const t = setTimeout(() => setScoreBounce(false), 400);
      return () => clearTimeout(t);
    }
  }, [score]);

  // Total possible questions
  const totalPossible = useMemo(() => {
    if (!config) return 0;
    if (config.template === 'matching') return config.pairs?.length || 0;
    if (config.template === 'tap-recognition') return config.items?.length || 0;
    if (config.template === 'drag-sort') return config.items?.length || 0;
    if (config.template === 'quiz') return config.questions?.length || 1;
    if (config.template === 'fill-in-blank') return config.blanks?.length || 0;
    if (config.template === 'puzzle-split') return config.pieces?.length || 0;
    return 0;
  }, [config]);

  const durationSec = config?.durationSec || 60;

  // Load game data
  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    Promise.all([
      apiClient.get(ENDPOINTS.LESSONS.GAME(lessonId)).catch(() => ({ data: null })),
      apiClient.get(ENDPOINTS.LESSONS.SCENES(lessonId)).catch(() => ({ data: { data: [] } })),
    ])
      .then(([gameRes, scenesRes]) => {
        const gameData = gameRes.data?.data || gameRes.data;
        if (gameData?.template) setConfig(gameData);

        const sceneData = scenesRes.data?.data || scenesRes.data;
        if (Array.isArray(sceneData) && sceneData.length > 0) {
          const allScenes: SceneText[] = [];
          sceneData.forEach((item: any) => {
            const inner = item?.scenes || (Array.isArray(item) ? item : []);
            if (Array.isArray(inner)) allScenes.push(...inner);
          });
          setScenes(allScenes.length > 0 ? [{ scenes: allScenes }] : []);
        }
      })
      .catch((err) => setError(err?.message || 'Failed to load game'))
      .finally(() => setLoading(false));
  }, [lessonId]);

  // After loading, if there are scenes, show intro first — UNLESS mode was pre-selected from URL or saved
  const introShown = useRef(false);
  useEffect(() => {
    if (!loading && config && scenes.length > 0 && !introShown.current) {
      // If mode was pre-selected (URL param or localStorage), skip intro → go straight to play
      if (validUrlMode || savedMode) {
        introShown.current = true;
        setPhase('play');
        setTimerRunning(mode !== 'learning');
        setTimerKey((k) => k + 1);
        return;
      }
      introShown.current = true;
      setPhase('intro');
      setSceneIdx(0);
    }
  }, [loading, config, scenes]);

  // ── Mode Lock: extract user info from JWT and fetch lock ─────────
  const tokenPayload = useMemo(() => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return {}; }
  }, []);
  const userRole = (tokenPayload.user_type || '').toLowerCase();
  const admissionNo = tokenPayload.admission_no || tokenPayload.id || '';
  const className = tokenPayload.class_name || tokenPayload.current_class || '';
  const canLockMode = ['teacher', 'parent', 'admin', 'branchadmin', 'superadmin'].includes(userRole) && admissionNo;
  const isTeacher = ['teacher', 'admin', 'branchadmin', 'superadmin'].includes(userRole);

  // Fetch mode lock when game loads — checks per-student AND class-wide
  useEffect(() => {
    if (!lessonId || !admissionNo) return;
    apiClient.get(ENDPOINTS.MODE_LOCK.GET(admissionNo, lessonId, className || undefined))
      .then((res) => {
        const lock = res.data?.data;
        if (lock?.locked_mode) {
          setModeLock(lock);
          setModeLocked(true);
          setMode(lock.locked_mode as GameMode);
        }
      })
      .catch(() => {}); // No lock — child can choose freely
  }, [lessonId, admissionNo, className]);

  // ── Natural progression: suggest learning mode for newly unlocked units ──
  const suggestedModeApplied = useRef(false);
  useEffect(() => {
    if (!lessonId || !admissionNo || suggestedModeApplied.current || loading) return;
    // Fetch suggested mode — checks if this lesson belongs to a unit
    // whose prerequisite was just passed and the student hasn't played yet
    apiClient.get(ENDPOINTS.LESSONS.SUGGESTED_MODE(lessonId, admissionNo))
      .then((res) => {
        const { suggested_mode, reason } = res.data?.data || {};
        if (suggested_mode && !suggestedModeApplied.current) {
          suggestedModeApplied.current = true;
          setMode(suggested_mode as GameMode);
          // Show a friendly toast about the progression
          if (reason) {
            import('react-hot-toast').then(({ default: toast }) => {
              toast(reason, { icon: '🎓', duration: 4000 });
            });
          }
        }
      })
      .catch(() => {}); // No suggestion — let child choose freely
  }, [lessonId, admissionNo, loading]);

  // Session Fatigue: suggest break after 7 minutes (Doc 16 §5)
  useEffect(() => {
    if (mode === 'learning' || breakDismissed) return;
    const checkInterval = setInterval(() => {
      const elapsed = (Date.now() - sessionStartRef.current) / 1000;
      if (elapsed >= 420 && !breakDismissed) {
        setShowBreakSuggestion(true);
      }
    }, 10000); // check every 10s
    return () => clearInterval(checkInterval);
  }, [mode, breakDismissed]);

  // Record each answer
  const handleAnswer = useCallback((result: AnswerResult) => {
    setAnswers((prev) => [...prev, result]);
  }, []);

  // Game complete — in test mode, pause for submit; in practice, show results; in learning, show learned screen
  const handleGameComplete = useCallback(
    (finalScore: number) => {
      setTimerRunning(false);
      setScore(finalScore);
      if (mode === 'learning') {
        setPhase('learning-done');
        submitProgress(0); // score=0 but counts as watched
      } else if (mode === 'test') {
        setPhase('waiting-submit');
      } else {
        setPhase('result');
        if (soundOn) speakComplete(finalScore);
        submitProgress(finalScore);
      }
    },
    [mode, soundOn],
  );

  // Submit progress to backend
  const submitProgress = useCallback(
    async (finalScore: number) => {
      if (!lessonId) return;
      setSubmitting(true);
      try {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
        let admissionNo = '';
        try {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
          admissionNo = decoded.admission_no || decoded.id || '';
        } catch {}
        await apiClient.post(ENDPOINTS.PROGRESS.GAME_COMPLETE, {
          child_admission_no: admissionNo,
          lesson_id: lessonId,
          score: finalScore,
          stars_earned: finalScore >= 20 ? 3 : finalScore >= 10 ? 2 : 1,
          mode,
          answers_count: answers.length,
          difficulty: config?.template === 'puzzle-split' ? puzzleDifficulty : undefined,
        }).catch(() => {});
      } finally {
        setSubmitting(false);
      }
    },
    [lessonId, mode, answers.length, config?.template, puzzleDifficulty],
  );

  // Timer expired — in test mode, treat as auto-submit
  const handleTimeUp = useCallback(() => {
    if (phase === 'play') {
      handleGameComplete(score);
    }
  }, [phase, score, handleGameComplete]);

  // Test mode submit — show results after student confirms
  const handleTestSubmit = useCallback(async () => {
    if (soundOn) speakComplete(score);
    submitProgress(score);

    // Adaptive retry: check if student needs practice (Doc 16 §1)
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    let admissionNo = '';
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      admissionNo = decoded.admission_no || decoded.id || '';
    } catch {}

    if (admissionNo && lessonId) {
      try {
        const res = await apiClient.post(ENDPOINTS.RETRY.TEST_COMPLETE, {
          student_id: admissionNo,
          item_id: lessonId,
          tier: 0,
          result: score > 0 ? 'pass' : 'fail',
        });
        const routing = res.data?.data?.routing;
        if (routing === 'practice') {
          // Gently route to practice mode — no discouragement
          setRetryMessage(res.data?.data?.message || "Let's practice this a bit more!");
          setPhase('retry-practice');
          return;
        }
        if (routing === 'teacher_flag') {
          setRetryMessage("Your teacher will help you with this one. Let's try something else!");
          setPhase('retry-practice');
          return;
        }
      } catch {}
    }

    setPhase('result');
  }, [score, soundOn, submitProgress, lessonId]);

  // Mode selected from navbar — respects lock hierarchy
  const handleModeSelect = (selectedMode: GameMode) => {
    if (isModeLocked) {
      // Child cannot override a lock
      const ROLE_HIERARCHY: Record<string, number> = { superadmin: 5, admin: 4, branchadmin: 4, teacher: 2, parent: 1, student: 0 };
      const callerRank = ROLE_HIERARCHY[userRole] || 0;
      const lockerRank = ROLE_HIERARCHY[modeLock?.locked_by_role || ''] || 0;
      if (callerRank <= lockerRank) return; // blocked
    }
    setMode(selectedMode);
    setAnswers([]);
    setScore(0);
    setTimerRunning(selectedMode !== 'learning');
    setTimerKey((k) => k + 1);
  };

  // Lock/unlock mode (teacher=class-wide, parent=per-student)
  const handleLockMode = async () => {
    if (!lessonId || !canLockMode) return;
    try {
      if (isModeLocked) {
        // Unlock — teachers remove class lock, parents remove per-student
        const payload: Record<string, string> = { lesson_id: lessonId };
        if (isTeacher && className) {
          payload.child_admission_no = '*';
          payload.class_code = className;
        } else {
          payload.child_admission_no = admissionNo;
        }
        await apiClient.delete(ENDPOINTS.MODE_LOCK.REMOVE, { data: payload });
        setModeLock(null);
        setModeLocked(false);
      } else {
        // Lock — teachers lock for class, parents lock for student
        const body: Record<string, string> = {
          lesson_id: lessonId,
          locked_mode: mode,
        };
        if (isTeacher && className) {
          body.child_admission_no = '*';
          body.class_code = className;
        } else {
          body.child_admission_no = admissionNo;
        }
        await apiClient.post(ENDPOINTS.MODE_LOCK.SET, body);
        setModeLock({ locked_mode: mode, locked_by_role: isTeacher ? 'teacher' : 'parent', locked_by_name: 'You' });
        setModeLocked(true);
      }
    } catch (err: any) {
      console.error('Mode lock failed:', err?.response?.data?.message || err.message);
    }
  };

  // Skip intro
  const handleSkipIntro = () => {
    setPhase('play');
    setTimerKey((k) => k + 1);
    setTimerRunning(mode !== 'learning');
  };

  // Advance intro
  const advanceIntro = async () => {
    if (soundOn) playTap();
    if (sceneIdx + 1 < scenes.length) {
      setSceneIdx((i) => i + 1);
    } else {
      setPhase('play');
      setTimerKey((k) => k + 1);
      setTimerRunning(mode !== 'learning');
    }
  };

  // Restart — go back to play phase
  const handleRestart = () => {
    setPhase('play');
    setScore(0);
    setAnswers([]);
    setTimerKey((k) => k + 1);
    setTimerRunning(mode !== 'learning');
  };

  // Auto-speak intro scenes
  useEffect(() => {
    if (phase !== 'intro' || !soundOn) return;
    const wrapper = scenes[sceneIdx];
    if (wrapper?.scenes) {
      const texts = wrapper.scenes.map((s) => s.text).join('. ');
      setSceneSpeaking(true);
      speakScene(texts).finally(() => setSceneSpeaking(false));
    }
  }, [phase, sceneIdx, scenes, soundOn]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6]">
        <div className="text-center animate-game-spring-in">
          <div className="relative mx-auto mb-4 h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-[#0F4D92]/10 animate-game-pulse" />
            <Loader2 className="relative mx-auto h-16 w-16 animate-spin text-[#0F4D92]" />
          </div>
          <p className="text-sm font-medium text-gray-600 animate-game-bob">Loading your game...</p>
          <div className="mt-3 flex justify-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/30 animate-game-pulse stagger-1" />
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/50 animate-game-pulse stagger-2" />
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/70 animate-game-pulse stagger-3" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6]">
        <div className="text-center animate-game-spring-in">
          <Gamepad2 className="mx-auto mb-3 h-12 w-12 text-gray-300 animate-game-wobble-idle" />
          <p className="font-semibold text-gray-700 animate-game-slide-up stagger-1">{error || 'Game not found'}</p>
          <button onClick={() => navigate('/student')} className="mt-4 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-medium text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 hover:animate-game-squish active:scale-95 animate-game-slide-up stagger-2">
            Back to Games
          </button>
        </div>
      </div>
    );
  }

  /* ── Choose Mode removed: mode switcher is in navbar ── */

  /* ── Intro Phase ── */
  if (phase === 'intro') {
    const wrapper = scenes[sceneIdx];
    const sceneTexts: SceneText[] = wrapper?.scenes || [];
    const isLastScene = sceneIdx + 1 >= scenes.length;

    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#E7EEF6] to-white overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 animate-game-slide-down">
          <button onClick={() => navigate('/student')} className="rounded-lg p-1.5 hover:bg-white/50 transition-all hover:scale-110 active:scale-95">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-600">Story Time 📖</h1>
            <span className="rounded-full bg-[#0F4D92]/10 px-2 py-0.5 text-[10px] font-bold text-[#0F4D92]">
              {sceneIdx + 1}/{scenes.length}
            </span>
          </div>
          <button onClick={() => setSoundOn(!soundOn)} className="rounded-lg p-1.5 hover:bg-white/50 transition-all hover:scale-110 active:scale-95">
            {soundOn ? <Volume2 className="h-5 w-5 text-[#0F4D92]" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
          </button>
        </header>

        {/* ── Mode picker on intro — tap to start playing immediately ── */}
        <div className="px-4 py-2 bg-white/60 backdrop-blur border-b border-white/50">
          <p className="text-center text-[10px] text-gray-400 mb-1.5">Tap a mode to start playing</p>
          <div className="mx-auto flex max-w-md gap-1 rounded-xl bg-white p-1 shadow-sm">
            {([
              { key: 'learning' as GameMode, icon: '📺', label: 'Learn', color: 'purple' },
              { key: 'practice' as GameMode, icon: '🎯', label: 'Practice', color: 'green' },
              { key: 'test' as GameMode, icon: '📝', label: 'Test', color: 'blue' },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  playTap();
                  handleModeSelect(m.key);
                  // Start playing immediately — skip intro
                  setPhase('play');
                  setTimerKey((k) => k + 1);
                  setTimerRunning(m.key !== 'learning');
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-semibold transition-all active:scale-95 ${
                  mode === m.key
                    ? m.key === 'learning'
                      ? 'bg-purple-500 text-white shadow-sm'
                      : m.key === 'test'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {/* Scene text cards with stagger entrance */}
          {sceneTexts.map((s, i) => (
            <div key={`${sceneIdx}-${i}`} className={`mb-4 max-w-md rounded-2xl bg-white p-6 shadow-md text-center animate-game-slide-up stagger-${Math.min(i + 1, 12)}`}>
              <p className="text-lg text-gray-700 leading-relaxed font-kid-body">{s.text}</p>
            </div>
          ))}

          {/* Speaking indicator with bouncing dots */}
          {sceneSpeaking && (
            <div className="mb-4 flex items-center gap-2 text-sm text-[#0F4D92]/70 animate-game-pop">
              <div className="flex gap-1">
                <Volume2 className="h-4 w-4 animate-game-bounce" />
                <div className="flex items-center gap-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0F4D92]/40 animate-game-pulse stagger-1" />
                  <span className="inline-block h-2 w-2 rounded-full bg-[#0F4D92]/60 animate-game-pulse stagger-2" />
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#0F4D92]/80 animate-game-pulse stagger-3" />
                </div>
              </div>
              <span className="font-medium">Speaking...</span>
            </div>
          )}

          {/* Progress dots for multi-scene stories */}
          {scenes.length > 1 && (
            <div className="mb-4 flex items-center gap-2 animate-game-slide-up stagger-4">
              {scenes.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i < sceneIdx
                      ? 'h-2.5 w-2.5 bg-green-400'
                      : i === sceneIdx
                      ? 'h-3 w-6 bg-[#0F4D92] animate-game-glow-pulse'
                      : 'h-2.5 w-2.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Next / Play button + Skip to Play */}
          <div className="mt-4 flex flex-col items-center gap-2 animate-game-spring-in stagger-5">
            <button
              onClick={advanceIntro}
              className={`rounded-xl px-8 py-3 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95 ${
                isLastScene
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                  : 'bg-[#0F4D92] hover:bg-[#0D3F7A]'
              }`}
            >
              {isLastScene ? (
                <span className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" /> Let's Play! 🎮
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Next <span className="animate-game-bounce inline-block">→</span>
                </span>
              )}
            </button>
            <button
              onClick={handleSkipIntro}
              className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              Skip story → Play now
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Waiting Submit (Test Mode) ── */
  if (phase === 'waiting-submit') {
    return (
      <WaitingSubmit
        score={score}
        totalAnswered={answers.length}
        totalPossible={totalPossible}
        onSubmit={handleTestSubmit}
        onBack={() => navigate('/student')}
      />
    );
  }

  /* ── Adaptive Retry Redirect (Doc 16 §1) ── */
  if (phase === 'retry-practice') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6">
        <div className="w-full max-w-md text-center animate-game-slide-up">
          <div className="mb-4 text-5xl animate-game-pop">🌟</div>
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Let's Practice Together!</h1>
          <p className="mb-6 text-sm text-gray-500">{retryMessage}</p>
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-md">
            <p className="text-sm text-gray-600">
              🎯 Try <span className="font-bold text-green-700">Practice Mode</span> to build your confidence,
              then come back to Test when you're ready!
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { playTap(); handleModeSelect('practice'); setPhase('play'); }}
              className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-green-600 transition-all hover:scale-105 active:scale-95"
            >
              🎯 Go to Practice
            </button>
            <button
              onClick={() => { playTap(); navigate('/student'); }}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
            >
              Back to Games
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Learning Complete ── */
  if (phase === 'learning-done') {
    return (
      <LearningComplete
        lessonTitle={config?.template || 'this game'}
        totalItems={totalPossible}
        onRestart={handleRestart}
        onBack={() => navigate('/student')}
      />
    );
  }

  /* ── Result Phase ── */
  if (phase === 'result') {
    return (
      <ResultBreakdown
        answers={answers}
        score={score}
        totalPossible={totalPossible}
        mode={mode}
        onRestart={handleRestart}
        onBack={() => navigate('/student')}
      />
    );
  }

  /* ── Play Phase ── */
  return (
    <div className="flex min-h-screen flex-col bg-[#E7EEF6]">
      <header className="flex items-center gap-1.5 border-b border-white/50 bg-white/80 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5 backdrop-blur">
        <button onClick={() => navigate('/student')} className="rounded-lg p-2 sm:p-1.5 hover:bg-gray-100 active:scale-95">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-[11px] sm:text-xs font-semibold text-gray-700 capitalize shrink-0">{config.template.replace('-', ' ')}</h1>
        <div className="flex-1" />
        {/* Lock indicator + toggle (teacher/parent only) */}
        {canLockMode && (
          <button
            onClick={handleLockMode}
            className={`rounded-lg p-2 sm:px-2 sm:py-1.5 text-xs font-semibold transition-all active:scale-95 ${
              isModeLocked
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            title={isModeLocked
              ? isTeacher
                ? `Locked for CLASS to ${modeLock?.locked_mode}. Click to unlock all.`
                : `Locked to ${modeLock?.locked_mode}. Click to unlock.`
              : isTeacher
                ? `Lock for CLASS to ${mode} mode (all students)`
                : `Lock to ${mode} mode`}
          >
            {isModeLocked ? '🔒' : '🔓'}
            {canLockMode && isTeacher && <span className="ml-0.5 text-[9px]">class</span>}
          </button>
        )}
        {isModeLocked && !canLockMode && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 font-medium" title={`Locked by ${modeLock?.locked_by_role} — ${modeLock?.class_code ? 'class-wide' : 'per-student'}`}>🔒</span>
        )}
        <button
          onClick={toggleColorblind}
          className={`rounded-lg p-2 sm:p-1.5 transition-all active:scale-95 ${colorblindMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}`}
          title={colorblindMode ? 'Colorblind mode ON' : 'Colorblind mode OFF'}
          aria-label="Toggle colorblind-safe colors"
        >
          <Palette className="h-5 w-5" />
        </button>
        <button onClick={() => setSoundOn(!soundOn)} className="rounded-lg p-2 sm:p-1.5 hover:bg-gray-100 active:scale-95">
          {soundOn ? <Volume2 className="h-5 w-5 text-[#0F4D92]" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
        </button>
        <SpeechSettings />
        {mode !== 'learning' && (
          <span className={`rounded-full bg-amber-100 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-amber-600 transition-all ${scoreBounce ? 'animate-game-score-bounce' : ''}`}>
            ⭐ {score}
          </span>
        )}
      </header>

      {/* ── Mode switcher bar (always visible, prominent) ── */}
      <div className="bg-white px-3 py-2 border-b border-gray-100">
        <div className="mx-auto flex max-w-lg gap-1 rounded-xl bg-gray-100 p-1">
          {([
            { key: 'learning' as GameMode, icon: '📺', label: 'Learn', color: 'purple', desc: 'Watch & learn' },
            { key: 'practice' as GameMode, icon: '🎯', label: 'Practice', color: 'green', desc: 'Instant feedback' },
            { key: 'test' as GameMode, icon: '📝', label: 'Test', color: 'blue', desc: 'No hints' },
          ]).map((m) => (
            <button
              key={m.key}
              onClick={() => handleModeSelect(m.key)}
              disabled={isModeLocked}
              title={isModeLocked ? `Locked by ${modeLock?.locked_by_role} (${modeLock?.locked_by_name || ''})` : m.desc}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-3 sm:py-2.5 text-sm font-semibold transition-all active:scale-95 ${
                mode === m.key
                  ? m.key === 'learning'
                    ? 'bg-purple-500 text-white shadow-md'
                    : m.key === 'test'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-green-500 text-white shadow-md'
                  : isModeLocked
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-500 hover:bg-white hover:text-gray-700 hover:shadow-sm'
              }`}
            >
              <span className="text-base">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Timer bar — hidden in learning mode */}
      {mode !== 'learning' && (
        <div className="bg-white px-4 py-2 border-b border-gray-100">
          <TimerBar
            key={timerKey}
            durationSec={durationSec}
            onTimeUp={handleTimeUp}
            running={timerRunning}
          />
        </div>
      )}

      {/* Session Fatigue: break suggestion (Doc 16 §5) */}
      {showBreakSuggestion && !breakDismissed && (
        <div className="mx-4 mb-3 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3 animate-game-slide-down">
          <span className="text-3xl animate-game-float">🌟</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">Great job today!</p>
            <p className="text-xs text-amber-600">You've been playing for a while. Let's take a little rest! 😴</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { playTap(); navigate('/student'); }}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-all"
            >
              Rest 🌙
            </button>
            <button
              onClick={() => { playTap(); setBreakDismissed(true); setShowBreakSuggestion(false); }}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-100 transition-all"
            >
              Keep Playing
            </button>
          </div>
        </div>
      )}

      {/* Game area */}
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-lg">
          {config.template === 'matching' && (
            <MatchingGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'tap-recognition' && (
            <TapGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'drag-sort' && (
            <DragSortGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'quiz' && (
            <QuizGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'fill-in-blank' && (
            <FillBlankGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'puzzle-split' && (
            <PuzzleGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} onDifficultyChange={setPuzzleDifficulty} />
          )}
        </div>
      </div>
    </div>
  );
}
