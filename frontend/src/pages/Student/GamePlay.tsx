import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  pairs?: { a: string; b: string; audio?: string }[];
  items?: { hex?: string; color?: string; num?: number; label?: string; image?: string; emoji?: string; sound?: string; audio?: string }[];
  objects?: { id: string; label: string; image?: string }[];
  correctId?: string;
  question?: string;
  options?: { id: string; label: string; image?: string; emoji?: string; audio?: string }[];
  answer?: string;
  durationSec?: number;
  sentence?: string;
  blanks?: { id: number; answer: string }[];
  wordBank?: string[];
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
          {current.image && <img src={current.image} alt={current.label} className="h-10 w-10 object-contain" />}
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
                  <img src={item.image} alt={item.label} className="h-14 w-14 object-contain" />
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
    </div>
  );
}/* ── Drag-Sort Game ────────────────────────────────────────── */

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
  const fbConfig = config as FillBlankConfig;
  const blanks = fbConfig.blanks || [];
  const sentence = fbConfig.sentence || '';
  const wordBank = useMemo(() => shuffle(fbConfig.wordBank || []), [fbConfig.wordBank]);

  const [filledSlots, setFilledSlots] = useState<Record<number, string>>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [score, setScore] = useState(0);
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
        const pts = blanks.length * 10;
        setScore(pts);
        blanks.forEach((b) => onAnswer?.({ correct: true, expected: b.answer, given: filledSlots[b.id] }));
        setTimeout(() => onComplete(pts), 800);
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
          setCompleted(false);
        }, 1500);
      }
      setCompleted(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [allFilled, completed, feedback, blanks, filledSlots, isTest, soundOn, onComplete, onAnswer]);

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

  if (blanks.length === 0) {
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
      <p className="text-center text-lg font-semibold text-gray-700">Complete the sentence 📝</p>
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
  const options = config.options || [];
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [tapping, setTapping] = useState<number | null>(null);
  const isTest = mode === 'test';

  const handleAnswer = (idx: number) => {
    if (feedback) return;
    const isCorrect = options[idx]?.id === config.correctId || options[idx]?.label === config.answer;
    // In test mode: no sound, no tapping animation, no selection highlight for wrong answers
    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(idx);
      setTimeout(() => setTapping(null), 300);
    }
    onAnswer?.({ correct: isCorrect, expected: config.answer || config.correctId || '', given: options[idx]?.label || '' });

    if (isCorrect) {
      if (!isTest && soundOn) playCorrect();
      if (!isTest) setFeedback('correct');
      setSelectedIdx(idx);
      setTimeout(() => onComplete(10), isTest ? 200 : 800);
    } else {
      // Wrong answer — in test mode: silently record, no visual feedback
    }
  };

  // ── Learning mode auto-play — speak question + answer ──
  useEffect(() => {
    if (mode !== 'learning' || feedback) return;
    const correctIdx = options.findIndex((opt) => opt.id === config.correctId || opt.label === config.answer);
    if (correctIdx === -1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Step 1: Read the question
      if (soundOn) await speak(stripEmoji(config.question || 'Choose the correct answer'));
      if (cancelled) return;
      // Step 2: Highlight + play teacher audio or speak the answer
      if (soundOn) playCorrect();
      setFeedback('correct');
      setSelectedIdx(correctIdx);
      onAnswer?.({ correct: true, expected: config.answer || config.correctId || '', given: options[correctIdx]?.label || '' });
      const answerName = speakLabel(options[correctIdx]?.label, undefined, options[correctIdx]?.emoji);
      if (soundOn) await speakOrPlay(options[correctIdx]?.audio, `The answer is ${answerName}`);
      setTimeout(() => onComplete(0), 600);
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, feedback, options, config, soundOn, onComplete, onAnswer]);

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
      <p className="text-center text-xl font-semibold text-gray-700 animate-game-drop-in">
        {config.question || 'Choose the correct answer'}
      </p>
      <div className="grid grid-cols-2 gap-4">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            className={`rounded-xl border-2 p-5 text-center font-semibold transition-all animate-game-slide-up stagger-${Math.min(i + 1, 12)} ${
              !isTest && feedback === 'correct' && (opt.id === config.correctId || opt.label === config.answer)
                ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                : selectedIdx === i && !isTest && feedback === 'wrong'
                ? `${cbWrong.border} ${cbWrong.bg} animate-game-wrong`
                : !isTest && feedback === 'wrong'
                ? 'border-gray-200 bg-white opacity-60 scale-95'
                : tapping === i
                ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish'
            }`}
          >
            {opt.image && <img src={opt.image} alt={opt.label} className="mx-auto mb-2 h-12 w-12 object-contain" />}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Mode Selector Screen ──────────────────────────────────── */

function ModeSelector({
  onStart,
  hasScenes,
  onSkipIntro,
}: {
  onStart: (mode: GameMode) => void;
  hasScenes: boolean;
  onSkipIntro: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#E7EEF6] to-white px-6">
      <div className="w-full max-w-sm text-center">
        <Gamepad2 className="mx-auto mb-4 h-14 w-14 text-[#0F4D92] animate-game-trophy-drop" />
        <h1 className="mb-2 text-2xl font-bold text-gray-800 animate-game-slide-up stagger-1">Choose Your Mode</h1>
        <p className="mb-8 text-sm text-gray-500 animate-game-slide-up stagger-2">How do you want to play?</p>

        <div className="space-y-4">
          <button
            onClick={() => { playTap(); onStart('learning'); }}
            className="w-full rounded-2xl border-2 border-purple-200 bg-purple-50 p-5 text-left transition-all hover:border-purple-400 hover:shadow-md hover:animate-game-squish active:scale-[0.98] animate-game-slide-up stagger-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-lg">📺</span>
              <div>
                <h3 className="font-bold text-purple-800">Learning Mode</h3>
                <p className="text-xs text-purple-600">Watch and learn! The game plays itself perfectly.</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => { playTap(); onStart('practice'); }}
            className="w-full rounded-2xl border-2 border-green-200 bg-green-50 p-5 text-left transition-all hover:border-green-400 hover:shadow-md hover:animate-game-squish active:scale-[0.98] animate-game-slide-up stagger-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-lg">🎯</span>
              <div>
                <h3 className="font-bold text-green-800">Practice Mode</h3>
                <p className="text-xs text-green-600">See if you're right instantly. Learn as you play!</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => { playTap(); onStart('test'); }}
            className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 text-left transition-all hover:border-blue-400 hover:shadow-md hover:animate-game-squish active:scale-[0.98] animate-game-slide-up stagger-5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-lg">📝</span>
              <div>
                <h3 className="font-bold text-blue-800">Test Mode</h3>
                <p className="text-xs text-blue-600">No hints! Submit when done and see your score.</p>
              </div>
            </div>
          </button>
        </div>

        {hasScenes && (
          <button
            onClick={() => { playTap(); onSkipIntro(); }}
            className="mt-6 text-sm text-gray-400 underline underline-offset-2 hover:text-gray-600 animate-game-slide-up stagger-5"
          >
            Skip story intro →
          </button>
        )}
      </div>
    </div>
  );
}

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
          {pct >= 80 ? '🎉 Excellent!' : pct >= 50 ? '⭐ Good Job!' : pct > 0 ? '💪 Keep Trying!' : '⏰ Time\'s Up!'}
        </h1>
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
        <h1 className="mb-2 text-3xl font-bold text-gray-800 animate-game-spring-in">You Learned It!</h1>
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

/* ── Main GamePlay Page ────────────────────────────────────── */

export default function GamePlay() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('play');
  const [mode, setMode] = useState<GameMode>('practice');
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
  const sessionStartRef = useRef(Date.now());
  const { colorblindMode, toggleColorblind } = useA11yStore();

  // Mode lock state (Teacher > Parent > Child hierarchy)
  const [modeLock, setModeLock] = useState<{ locked_mode: string; locked_by_role: string; locked_by_name?: string; class_code?: string } | null>(null);
  const [modeLocked, setModeLocked] = useState(false);
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
    if (config.template === 'quiz') return 1;
    if (config.template === 'fill-in-blank') return config.blanks?.length || 0;
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

  // After loading, if there are scenes, show intro first
  const introShown = useRef(false);
  useEffect(() => {
    if (!loading && config && scenes.length > 0 && !introShown.current) {
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
        }).catch(() => {});
      } finally {
        setSubmitting(false);
      }
    },
    [lessonId, mode, answers.length],
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

          {/* Next / Play button */}
          <button
            onClick={advanceIntro}
            className={`mt-4 rounded-xl px-8 py-3 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95 animate-game-spring-in stagger-5 ${
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
      <header className="flex items-center gap-2 border-b border-white/50 bg-white/80 px-3 py-2.5 backdrop-blur">
        <button onClick={() => navigate('/student')} className="rounded-lg p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-xs font-semibold text-gray-700 capitalize shrink-0">{config.template.replace('-', ' ')}</h1>
        {/* Mode switcher tabs */}
        <div className="flex-1 flex justify-center">
          <div className="flex gap-0.5 rounded-xl bg-gray-100 p-0.5">
            {([
              { key: 'learning' as GameMode, icon: '📺', label: 'Learn', color: 'purple' },
              { key: 'practice' as GameMode, icon: '🎯', label: 'Practice', color: 'green' },
              { key: 'test' as GameMode, icon: '📝', label: 'Test', color: 'blue' },
            ]).map((m) => {
              const isLockedTab = isModeLocked && mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => handleModeSelect(m.key)}
                  disabled={isModeLocked}
                  title={isModeLocked ? `Locked by ${modeLock?.locked_by_role} (${modeLock?.locked_by_name || ''})` : undefined}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    mode === m.key
                      ? m.key === 'learning'
                        ? 'bg-purple-500 text-white shadow-sm'
                        : m.key === 'test'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-green-500 text-white shadow-sm'
                      : isModeLocked
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-500 hover:bg-white hover:text-gray-700'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Lock indicator + toggle (teacher/parent only) */}
        {canLockMode && (
          <button
            onClick={handleLockMode}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
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
          className={`rounded-lg p-1.5 transition-all ${colorblindMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}`}
          title={colorblindMode ? 'Colorblind mode ON' : 'Colorblind mode OFF'}
          aria-label="Toggle colorblind-safe colors"
        >
          <Palette className="h-4 w-4" />
        </button>
        <button onClick={() => setSoundOn(!soundOn)} className="rounded-lg p-1.5 hover:bg-gray-100">
          {soundOn ? <Volume2 className="h-4 w-4 text-[#0F4D92]" /> : <VolumeX className="h-4 w-4 text-gray-400" />}
        </button>
        <SpeechSettings />
        {mode !== 'learning' && (
          <span className={`rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-600 transition-all ${scoreBounce ? 'animate-game-score-bounce' : ''}`}>
            ⭐ {score}
          </span>
        )}
      </header>

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
        </div>
      </div>
    </div>
  );
}
