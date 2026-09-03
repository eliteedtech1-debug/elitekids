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
  CreditCard,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { offlineApi } from '@/lib/offline/api';
import { offlineSync } from '@/lib/offline/sync';
import { offlineContent } from '@/lib/offline/content';
import OfflineBanner from '@/components/OfflineBanner';
import SpeakButton from '@/components/SpeakButton';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t, tN } from '@/lib/i18n';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import TimerBar from '@/components/Timer';
import { getItemVisual, getNumberEmoji, getNumberImageUrl } from '@/lib/utils/icons';
import { useA11yStore } from '@/lib/utils/a11y-store';
import SpeechSettings from '@/components/SpeechSettings';
import SpeechInput from '@/components/SpeechInput';
import CachedImg from '@/components/CachedImg';
import LabelDiagramGame from '@/components/LabelDiagram';
import StageSequenceGame from '@/components/StageSequence';
import SceneRenderer from '@/components/SceneRenderer';
import { flattenScenes, isVisualStory, estimateDurationSec } from '@/lib/utils/scenes';
import type { SceneLibrary, NormalizedScene } from '@/lib/utils/scenes';
// NOTE: children never see payment UI — no SubscriptionUpsell here anymore.
import StickerButton from '@/components/StickerButton';
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
  speakPhonicsSound,
  toPhonicsSound,
  playStreak,
  playHint,
  playCelebration,
} from '@/lib/utils/sound';
import { playCombo, playComboBreak, playRageFill, playRageActive, playBossAttack, playBossDefeated, playVictory, playLocked } from '@/lib/game/sound-effects';
import { createCombo, recordCorrect as comboCorrect, recordIncorrect as comboIncorrect, getComboFireLevel } from '@/lib/game/combo';
import type { ComboState } from '@/lib/game/combo';
import { awardPowerUps, getAvailable, usePowerUp } from '@/lib/game/power-ups';
import { launchConfetti } from '@/lib/game/victory';
import { qualityForAnswers, pickNextRecs, reasonEmoji, humanizeSkill } from '@/lib/game/review';
import apiClientBoss from '@/lib/api/client';
import type { PromptMode, ResponseMode } from '@/lib/types/game';
import { getPromptDisplay, getResponseDisplay } from '@/lib/types/game';

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
  gameId?: string;
  template: string;
  lessonId?: string;
  ageLevel?: string;
  prompt?: string;
  pairs?: { a: string; b: string; audio?: string; image?: string }[];
  items?: { id?: string; hex?: string; color?: string; num?: number; label?: string; image?: string; emoji?: string; sound?: string; audio?: string; context?: string; matches?: string }[];
  objects?: { id: string; label: string; image?: string }[];
  correctId?: string;
  question?: string;
  options?: { id: string; label: string; image?: string; emoji?: string; audio?: string; text?: string }[];
  answer?: string;
  questions?: { id?: string; prompt?: string; question?: string; image?: string; scenario?: string; characterName?: string; characterImage?: string; characterEmoji?: string; setting?: string; settingImage?: string; hint?: string; speechText?: string; feedbackCorrect?: string; feedbackWrong?: string; options?: { id: string; label: string; image?: string; emoji?: string; audio?: string }[]; correctIndex?: number; correctId?: string; answer?: string; isReview?: boolean; lesson_id?: string; question_id?: string }[];
  sentences?: { sentence: string; blanks: { id: number; answer: string }[]; wordBank?: string[]; context?: string }[];
  durationSec?: number;
  sentence?: string;
  blanks?: { id: number; answer: string }[];
  wordBank?: string[];
  // Input mode: 'tap' | 'speak' | 'both' — controls whether kids tap, speak, or both
  inputMode?: 'tap' | 'speak' | 'both';
  // Scenario-based game fields (used by quiz + tap-recognition)
  scenario?: string;
  hint?: string;
  speechText?: string;
  feedbackCorrect?: string;
  feedbackWrong?: string;
  // Multimodal interaction: how the concept is presented and how the learner responds
  promptMode?: PromptMode;   // 'text' | 'image' | 'audio' | 'context'
  responseMode?: ResponseMode; // 'text' | 'image' | 'audio'
  // Multimodal content fields
  image?: string;    // URL to prompt image
  context?: string;  // Contextual description/riddle
  audio?: string;    // URL to prompt audio
  // Scenario-based quiz fields
  category?: string;  // e.g. "Letters", "Numbers", "Animals" — used for phonics TTS routing
  characters?: { name: string; image?: string; emoji?: string; personality?: string }[];
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
type AnswerResult = { correct: boolean; expected: string; given: string; question_id?: string; lesson_id?: string; is_review?: boolean; response_time_ms?: number };

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
 * Priority: label > color > emoji name.
 * For phonics graphemes (1-2 letters, Letters category), returns the sound not the name. */
function speakLabel(label?: string, color?: string, emoji?: string, category?: string): string {
  if (label) {
    // If this looks like a phonics grapheme (1-2 alpha chars) and we're in a Letters game,
    // convert to the phonics sound so TTS says "sss" not "ess"
    const trimmed = label.trim();
    if (category === 'Letters' && /^[a-z]{1,2}$/i.test(trimmed)) {
      return toPhonicsSound(trimmed.toLowerCase());
    }
    return trimmed;
  }
  if (color && !color.startsWith('#')) return color.trim();
  if (emoji) return emoji.trim();
  return '';
}

/** Strip emojis from text so speech only reads the label word. */
function stripEmoji(text: string): string {
  return text
    .replace(/\p{Emoji_Presentation}/gu, '')
    .replace(/\p{Emoji}\uFE0F\u20E3/gu, '')
    .replace(/[\uFE0F\u200B\u200C\u200D\u20E3]/gu, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+/g, ' ');
}

/** Play a teacher-recorded audio file, or fall back to TTS speak. */
function speakOrPlay(audioUrl?: string, fallbackText?: string): Promise<void> {
  if (audioUrl) {
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => resolve();
      audio.onerror = () => {
        // Audio failed — fall back to TTS in English (game content is English)
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
  const promptMode = config.promptMode || 'text';
  const responseMode = config.responseMode || 'image';
  const isLearning = mode === 'learning';
  const isTest = mode === 'test';
  const [selected, setSelected] = useState<{ side: 'a' | 'b'; index: number } | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [dancing, setDancing] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [floatingXP, setFloatingXP] = useState(false);
  const shuffledB = useRef(shuffle(pairs.map((p, i) => ({ label: p.b, origIdx: i }))));

  // Resolve character
  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[0] : null;

  // Read scenario/prompt aloud in test + practice mode.
  // Short delay (100ms) to let UI settle while staying within browser gesture window.
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || '';
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFeedbackMsg = (type: 'correct' | 'wrong') => {
    const msg = type === 'correct'
      ? (config.feedbackCorrect || t('game.feedback.matchCorrect'))
      : (config.feedbackWrong || t('game.feedback.matchWrong'));
    setFeedback(type);
    setFeedbackMsg(msg);
    if (type === 'wrong' && config.hint) {
      setTimeout(() => setShowHint(true), 600);
    }
    setTimeout(() => { setFeedback(null); setFeedbackMsg(''); setShowHint(false); }, type === 'correct' ? 1500 : 2000);
  };

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
      setStreak((s) => s + 1);
      setFloatingXP(true);
      setTimeout(() => setFloatingXP(false), 800);
      if (!isTest) {
        showFeedbackMsg('correct');
        if (streak > 0 && streak % 3 === 2 && soundOn) playStreak(Math.floor(streak / 3));
      }
      onAnswer?.({ correct: true, expected: pairs[aIdx].a, given: pairs[aIdx].b });
      if (newMatched.size === pairs.length) {
        setTimeout(() => onComplete(score + 10), isTest ? 200 : 800);
      }
    } else {
      setStreak(0);
      if (!isTest && soundOn) playWrong();
      if (!isTest) {
        setWrong(`${side}-${index}`);
        setTimeout(() => setWrong(null), 500);
        showFeedbackMsg('wrong');
      }
      onAnswer?.({ correct: false, expected: pairs[aIdx].a, given: pairs[bOrigIdx]?.b || '?' });
      setSelected(null);
    }
  };

  const isMatchedA = (i: number) => matched.has(i);

  // Learning mode auto-play
  useEffect(() => {
    if (mode !== 'learning') return;
    const nextIdx = pairs.findIndex((_, i) => !matched.has(i));
    if (nextIdx === -1) return;
    const pair = pairs[nextIdx];
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSelected({ side: 'a', index: nextIdx });
      if (soundOn) await speakOrPlay(pair.audio, stripEmoji(pair.a) || pair.a);
      if (cancelled) return;
      setSelected({ side: 'b', index: nextIdx });
      if (soundOn) await speakOrPlay(pair.audio, stripEmoji(pair.b) || pair.b);
      if (cancelled) return;
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
    <div className="space-y-4">
      {/* Character badge */}
      {currentCharacter && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {currentCharacter.image ? (
              <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-full w-full object-cover" />
            ) : currentCharacter.emoji ? (
              <span className="text-2xl">{currentCharacter.emoji}</span>
            ) : (
              <span className="text-lg font-bold text-[#0F4D92]">{currentCharacter.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{currentCharacter.name}</p>
            {currentCharacter.personality && <p className="text-xs text-gray-400">{currentCharacter.personality}</p>}
          </div>
        </div>
      )}

      {/* Scenario card */}
      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Mode badges */}
      {isLearning && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ {t('game.test.matchPairs')}
        </p>
      )}

      {/* Streak badge */}
      {streak >= 2 && !isTest && (
        <div className="text-center animate-game-pop">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            🔥 {t('game.streak', { count: streak })}
          </span>
        </div>
      )}

      <p className="text-center text-sm font-medium text-gray-500">
        Tap a letter on the left, match it on the right
        <SpeakButton text={config.speechText || config.scenario || 'Tap a letter on the left, match it on the right'} size="sm" className="ml-2 align-middle" />
      </p>

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
              {isLearning ? (
                <span>{pair.a}</span>
              ) : promptMode === 'image' && (pair as any).image ? (
                <CachedImg src={(pair as any).image} alt="" className="h-10 w-10 object-contain" />
              ) : promptMode === 'audio' ? (
                <span className="flex items-center gap-1"><Volume2 className="h-4 w-4" />{stripEmoji(pair.a)}</span>
              ) : (
                <span>{pair.a}</span>
              )}
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
              {isLearning ? (
                <span>{item.label}</span>
              ) : responseMode === 'image' && (pairs[item.origIdx] as any)?.image ? (
                <CachedImg src={(pairs[item.origIdx] as any).image} alt="" className="h-10 w-10 object-contain" />
              ) : responseMode === 'audio' ? (
                <span className="flex items-center gap-1"><Volume2 className="h-4 w-4" />{stripEmoji(item.label)}</span>
              ) : (
                <span>{item.label}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Hint */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm font-medium text-amber-800 flex-1">{config.hint}</p>
            <SpeakButton text={config.hint} size="sm" className="ml-1" />
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold max-w-md mx-auto ${
            feedback === 'correct' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
          </div>
        </div>
      )}

      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
        </div>
      )}

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        {pairs.map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              matched.has(i) ? 'bg-green-400' : 'bg-gray-200'
            }`}
          />
        ))}
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
  const promptMode = config.promptMode || 'text';
  const responseMode = config.responseMode || 'image';
  const isLearning = mode === 'learning';
  const isTest = mode === 'test';
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [popId, setPopId] = useState<number | null>(null);
  const [tapping, setTapping] = useState<number | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [floatingXP, setFloatingXP] = useState(false);
  const current = items[currentIdx];

  // Resolve character
  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[currentIdx % characters.length] : null;

  // Read scenario/prompt aloud in test + practice mode
  useEffect(() => {
    if (!soundOn || !current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || config.prompt || config.context || '';
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTap = (idx: number) => {
    if (feedback) return;
    const isCorrect = idx === currentIdx;
    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(idx);
      setTimeout(() => setTapping(null), 300);
    }

    if (isCorrect) {
      if (!isTest && soundOn) playCorrect();
      if (!isTest) {
        setFeedback('correct');
        setFeedbackMsg(config.feedbackCorrect || t('game.feedback.greatJob'));
        setFloatingXP(true);
      }
      setPopId(idx);
      setScore((s) => s + 10);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak === 3 || newStreak === 5) {
        if (soundOn) playStreak(newStreak);
      }
      onAnswer?.({ correct: true, expected: current?.color || current?.label || '', given: items[idx]?.color || items[idx]?.label || '' });
      setTimeout(() => {
        setFeedback(null);
        setFeedbackMsg('');
        setPopId(null);
        setFloatingXP(false);
        if (currentIdx + 1 >= items.length) {
          onComplete(score + 10);
        } else {
          setCurrentIdx((i) => i + 1);
        }
      }, isTest ? 300 : 1000);
    } else {
      if (!isTest) {
        if (soundOn) playHint();
        setFeedback('wrong');
        setFeedbackMsg(config.feedbackWrong || t('game.feedback.notQuite'));
        setWrongIdx(idx);
        setShowHint(true);
        setTimeout(() => { setFeedback(null); setWrongIdx(null); }, 1200);
      }
      onAnswer?.({ correct: false, expected: current?.color || current?.label || '', given: items[idx]?.color || items[idx]?.label || '' });
    }
  };

  // Learning mode: scenario auto-speaks via effect above.
  // Answer does NOT auto-play — child taps "Play Answer" to hear it.
  const [learningAnswerPlayed, setLearningAnswerPlayed] = useState(false);
  useEffect(() => { setLearningAnswerPlayed(false); }, [currentIdx]);

  const playLearningAnswer = useCallback(async () => {
    if (!current || learningAnswerPlayed) return;
    setLearningAnswerPlayed(true);
    if (soundOn) await speakOrPlay(current.audio, speakLabel(current.label, current.color, current.emoji, config.category));
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
  }, [current, currentIdx, items.length, soundOn, onComplete, onAnswer, learningAnswerPlayed]);

  if (!current) return null;

  const scenarioText = config.scenario || '';
  const promptText = config.prompt || t('game.findTarget');

  return (
    <div className="space-y-5">
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          📝 {t('game.test.findRight')}
        </p>
      )}

      {/* Streak counter */}
      {streak >= 2 && !isTest && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 px-3 py-1 text-xs font-bold text-white shadow-md animate-game-pop">
            <span>🔥</span>
            <span>{t('game.streak', { count: streak })}</span>
          </div>
        </div>
      )}

      {/* Character + Scenario Card */}
      {currentCharacter && (
        <div className="flex items-center gap-2 mb-1 animate-game-drop-in">
          {currentCharacter.image ? (
            <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm animate-game-pop" />
          ) : currentCharacter.emoji ? (
            <span className="text-3xl animate-game-pop" role="img" aria-label={currentCharacter.name}>{currentCharacter.emoji}</span>
          ) : (
            <span className="h-10 w-10 rounded-full bg-[#0F4D92] flex items-center justify-center text-white text-sm font-bold animate-game-pop">{currentCharacter.name.charAt(0)}</span>
          )}
          <div>
            <p className="text-sm font-bold text-gray-700">{currentCharacter.name}</p>
          </div>
          {currentCharacter.personality && (
            <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{currentCharacter.personality}</span>
          )}
        </div>
      )}

      {/* Scenario / Prompt */}
      <div className={`text-center animate-game-drop-in ${currentCharacter ? '' : ''}`}>
        {scenarioText ? (
          <div className={`relative rounded-2xl p-5 shadow-sm mx-auto max-w-md ${
            currentCharacter ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100' : 'bg-white border border-gray-100'
          }`}>
            {currentCharacter && <div className="absolute -top-2 left-8 w-4 h-4 rotate-45 bg-blue-50 border-l border-t border-blue-100" />}
            <p className="text-lg font-medium text-gray-700 leading-relaxed font-kid-body relative z-10">
              {scenarioText}
              <SpeakButton text={scenarioText} size="sm" className="ml-2 align-middle" />
            </p>
          </div>
        ) : promptMode === 'image' ? (
          <>
            <p className="text-lg font-semibold text-gray-700">
              {t('game.whatIsThis')}
              <SpeakButton text={config.speechText || config.prompt || t('game.whatIsThis')} size="sm" className="ml-2 align-middle" />
            </p>
            <div className="mt-2 inline-flex items-center justify-center rounded-xl px-6 py-4 bg-blue-50 animate-game-float animate-game-glow-pulse">
              {current.image ? (
                <CachedImg src={current.image} alt="" className="h-20 w-20 object-contain" />
              ) : current.emoji ? (
                <span className="text-5xl" role="img" aria-label="item">{current.emoji}</span>
              ) : isHex(current.hex) ? (
                <div className="h-16 w-16 rounded-full shadow-inner border-2 border-white/50" style={{ backgroundColor: current.hex }} />
              ) : (
                <span className="text-3xl font-bold text-gray-400">?</span>
              )}
            </div>
          </>
        ) : promptMode === 'audio' ? (
          <>
            <p className="text-lg font-semibold text-gray-700">
              {t('game.listenAndFind')}
              <SpeakButton text={config.speechText || config.prompt || config.scenario || t('game.listenAndFind')} size="sm" className="ml-2 align-middle" />
            </p>
            <div className="mt-2 inline-flex items-center justify-center rounded-xl px-6 py-4 bg-purple-50 animate-game-float animate-game-glow-pulse">
              <Volume2 className="h-12 w-12 text-purple-500 animate-game-bounce" />
            </div>
          </>
        ) : promptMode === 'context' ? (
          <div className="mt-2 inline-flex items-center justify-center rounded-xl px-6 py-4 bg-amber-50 animate-game-float animate-game-glow-pulse">
            <p className="text-lg font-medium text-amber-800">
              {current.context || `Find the ${readableLabel(current.label, current.color, current.emoji)}`}
              <SpeakButton text={current.context || config.speechText || `Find the ${readableLabel(current.label, current.color, current.emoji)}`} size="sm" className="ml-2 align-middle" />
            </p>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold text-gray-700">
              {promptText}
              <SpeakButton text={promptText} size="sm" className="ml-2 align-middle" />
            </p>
            <div className="mt-1 inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-blue-50 animate-game-float animate-game-glow-pulse">
              {current.image && <CachedImg src={current.image} alt="" className="h-10 w-10 object-contain" />}
              {current.emoji && <span className="text-3xl" role="img" aria-label={current.label || current.color}>{current.emoji}</span>}
              {!current.emoji && !current.image && isHex(current.hex) && (
                <div className="h-8 w-8 rounded-full shadow-inner border-2 border-white/50" style={{ backgroundColor: current.hex }} />
              )}
              {readableLabel(current.label, current.color, current.emoji) && (
                <span className="text-2xl font-bold text-[#0F4D92] capitalize">{readableLabel(current.label, current.color, current.emoji)}</span>
              )}
            </div>
          </>
        )}

        {/* TTS indicator in test mode */}
        {isTest && soundOn && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-blue-400">
            <Volume2 className="h-3 w-3 animate-game-bounce" />
            <span>{t('game.readingAloud')}</span>
          </div>
        )}
      </div>

      {/* Answer grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {shuffle(items).map((item, i) => {
          const realIdx = items.indexOf(item);
          return (
            <button
              key={i}
              onClick={() => handleTap(realIdx)}
              disabled={!!feedback && feedback === 'correct'}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all animate-game-drop-in stagger-${Math.min(i + 1, 12)} ${
                !isTest && feedback === 'correct' && realIdx === currentIdx
                  ? `${cbCorrect.border} ${cbCorrect.bg} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                  : popId === realIdx
                  ? `${cbCorrect.border} ${cbCorrect.bg} animate-game-spring-in`
                  : !isTest && feedback === 'wrong' && wrongIdx === realIdx
                  ? `${cbWrong.border} ${cbWrong.bg} animate-game-wrong`
                  : !isTest && feedback === 'wrong' && realIdx !== currentIdx
                  ? 'border-gray-200 bg-white opacity-50 scale-95'
                  : tapping === realIdx
                  ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                  : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish active:scale-95'
              }`}
            >
              <div className="flex items-center justify-center">
                {isLearning ? (
                  <>
                    {item.emoji && <span className="text-4xl" role="img" aria-label={item.label || item.color}>{item.emoji}</span>}
                    {item.image && !item.emoji && <CachedImg src={item.image} alt={item.label} className="h-14 w-14 object-contain" />}
                    {!item.emoji && !item.image && isHex(item.hex) && (
                      <div className="h-14 w-14 rounded-full shadow-inner border-2 border-white/50" style={{ backgroundColor: item.hex }} />
                    )}
                  </>
                ) : responseMode === 'image' ? (
                  item.image ? (
                    <CachedImg src={item.image} alt="" className="h-16 w-16 object-contain" />
                  ) : item.emoji ? (
                    <span className="text-5xl" role="img" aria-label="option">{item.emoji}</span>
                  ) : isHex(item.hex) ? (
                    <div className="h-14 w-14 rounded-full shadow-inner border-2 border-white/50" style={{ backgroundColor: item.hex }} />
                  ) : (
                    <span className="text-2xl font-bold text-gray-400">?</span>
                  )
                ) : responseMode === 'audio' ? (
                  <span className="flex flex-col items-center gap-1">
                    <Volume2 className="h-8 w-8 text-[#0F4D92]" />
                    <span className="text-xs text-gray-400">{t('game.tapToHear')}</span>
                  </span>
                ) : (
                  <span className="text-lg font-bold text-gray-800 capitalize">{readableLabel(item.label, item.color, item.emoji)}</span>
                )}
              </div>
              {isLearning && readableLabel(item.label, item.color, item.emoji) && (
                <span className="text-sm font-bold text-gray-700 capitalize">{readableLabel(item.label, current.color, item.emoji)}</span>
              )}
              {/* Correct checkmark overlay */}
              {!isTest && feedback === 'correct' && realIdx === currentIdx && (
                <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-green-500 flex items-center justify-center shadow-md animate-game-pop">
                  <span className="text-white text-sm">✓</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm font-medium text-amber-800 flex-1">{config.hint}</p>
            <SpeakButton text={config.hint} size="sm" className="ml-1" />
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold max-w-md mx-auto ${
            feedback === 'correct' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
          </div>
        </div>
      )}

      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
        </div>
      )}

      {/* Progress dots */}
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

      {/* Play Answer button — learning mode only */}
      {isLearning && !learningAnswerPlayed && !feedback && (
        <div className="flex justify-center">
          <button
            onClick={playLearningAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-100 border border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition-all hover:scale-105 active:scale-95 animate-game-pop"
          >
            <Volume2 className="h-4 w-4" /> {t('game.playAnswer')} 🔊
          </button>
        </div>
      )}

      {/* Voice input */}
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
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [tapping, setTapping] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [floatingXP, setFloatingXP] = useState(false);
  const isTest = mode === 'test';
  const isLearning = mode === 'learning';
  const expectedNext = sortedItems[placed.length];

  // Resolve character
  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[0] : null;

  // Read scenario/prompt aloud in test + practice mode
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || '';
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFeedbackMsg = (type: 'correct' | 'wrong') => {
    const msg = type === 'correct'
      ? (config.feedbackCorrect || t('game.feedback.greatJob'))
      : (config.feedbackWrong || t('game.feedback.notQuite'));
    setFeedback(type);
    setFeedbackMsg(msg);
    if (type === 'wrong' && config.hint) {
      setTimeout(() => setShowHint(true), 600);
    }
    setTimeout(() => { setFeedback(null); setFeedbackMsg(''); setShowHint(false); }, type === 'correct' ? 1200 : 2000);
  };

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
      if (!isTest) showFeedbackMsg('correct');
      setScore((s) => s + 10);
      setStreak((s) => s + 1);
      setFloatingXP(true);
      setTimeout(() => setFloatingXP(false), 800);
      if (!isTest && streak > 0 && streak % 3 === 2 && soundOn) playStreak(Math.floor(streak / 3));
      onAnswer?.({ correct: true, expected: `${expectedNext.num}. ${expectedNext.label}`, given: `${item.num}. ${item.label}` });
      setTimeout(() => {
        const newPlaced = [...placed, item];
        setPlaced(newPlaced);
        setRemaining((r) => r.filter((x) => x.num !== item.num));
        setFeedback(null);
        if (newPlaced.length >= items.length) onComplete(score + 10);
      }, 500);
    } else {
      setStreak(0);
      if (!isTest) showFeedbackMsg('wrong');
      onAnswer?.({ correct: false, expected: `${expectedNext?.num}. ${expectedNext?.label}`, given: `${item.num}. ${item.label}` });
    }
  }, [feedback, isTest, soundOn, expectedNext, placed, items, score, onComplete, onAnswer, streak]);

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

  // Learning mode: scenario auto-speaks via effect above.
  // Answer does NOT auto-play — child taps "Play Answer" to hear it.
  const [learningAnswerPlayed, setLearningAnswerPlayed] = useState(false);
  useEffect(() => { setLearningAnswerPlayed(false); }, [expectedNext?.num]);

  const playLearningAnswer = useCallback(async () => {
    if (!expectedNext || learningAnswerPlayed) return;
    setLearningAnswerPlayed(true);
    if (soundOn) await speakOrPlay(expectedNext.audio, speakLabel(expectedNext.label, undefined, expectedNext.emoji, config.category));
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
  }, [expectedNext, soundOn, onAnswer, placed, items.length, onComplete, learningAnswerPlayed]);

  return (
    <div className="space-y-4 relative select-none">
      {/* Character badge */}
      {currentCharacter && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {currentCharacter.image ? (
              <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-full w-full object-cover" />
            ) : currentCharacter.emoji ? (
              <span className="text-2xl">{currentCharacter.emoji}</span>
            ) : (
              <span className="text-lg font-bold text-[#0F4D92]">{currentCharacter.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{currentCharacter.name}</p>
            {currentCharacter.personality && <p className="text-xs text-gray-400">{currentCharacter.personality}</p>}
          </div>
        </div>
      )}

      {/* Scenario card */}
      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Mode badges */}
      {isLearning && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ {hasNums ? t('game.test.orderNumbers') : t('game.test.orderAlphabetical')}
        </p>
      )}

      {/* Streak badge */}
      {streak >= 2 && !isTest && (
        <div className="text-center animate-game-pop">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            🔥 {t('game.streak', { count: streak })}
          </span>
        </div>
      )}

      <p className="text-center text-lg font-semibold text-gray-700">
        {hasNums
          ? <>{t('game.putInOrder')} <span className="text-[#0F4D92]">1 → {items.length}</span></>
          : <>{t('game.putInOrder')} <span className="text-[#0F4D92]">{t('game.alphabeticalOrder')}</span></>}
        <SpeakButton text={config.speechText || config.scenario || (hasNums ? `${t('game.putInOrder')} 1 → ${items.length}` : `${t('game.putInOrder')} ${t('game.alphabeticalOrder')}`)} size="sm" className="ml-2 align-middle" />
      </p>
      <p className="text-center text-xs text-gray-400">{t('game.dragWordsHere')} 👇</p>

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
        {placed.length === 0 && !dragOver && <span className="text-sm text-gray-400 animate-game-float-slow">{t('game.dragWordsHere')}</span>}
        {dragOver && placed.length === 0 && <span className="text-sm font-medium text-[#0F4D92] animate-game-pop">{t('game.dropHere')} 🎯</span>}
        {placed.map((item, idx) => (
          <span key={item.num} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm border animate-game-slide-up ${cbCorrect.bg} ${cbCorrect.border} ${cbCorrect.text}`} style={{ animationDelay: `${idx * 0.05}s` }}>
            {item.num}. {item.label} ✓
          </span>
        ))}
        {placed.length > 0 && (
          <div className="w-full text-center mt-1">
            <span className="text-xs font-semibold text-green-600 animate-game-bounce inline-block">{t('game.itemsPlaced', { placed: placed.length, total: items.length })}</span>
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
            <div className="mt-1 text-[10px] text-gray-400">⠿ {t('game.drag')}</div>
          </button>
        ))}
      </div>

      {/* Touch ghost */}
      {touchGhost && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2 font-bold text-blue-700 shadow-lg animate-game-pop"
          style={{ left: touchGhost.x - 40, top: touchGhost.y - 30 }}
        >
          {touchGhost.num}. {touchGhost.label}
        </div>
      )}

      {/* Play Answer button — learning mode only */}
      {isLearning && !learningAnswerPlayed && !feedback && expectedNext && (
        <div className="flex justify-center">
          <button
            onClick={playLearningAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-100 border border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition-all hover:scale-105 active:scale-95 animate-game-pop"
          >
            <Volume2 className="h-4 w-4" /> {t('game.playAnswer')} 🔊
          </button>
        </div>
      )}

      {/* Hint */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>            <p className="text-sm font-medium text-amber-800 flex-1">{config.hint}</p>
            <SpeakButton text={config.hint} size="sm" className="ml-1" />
          </div>
        </div>


      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold max-w-md mx-auto ${
            feedback === 'correct' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
          </div>
        </div>
      )}

      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
        </div>
      )}

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        {sortedItems.map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              i < placed.length ? 'bg-green-400' : i === placed.length ? 'bg-[#0F4D92] scale-125' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
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
  const promptMode = config.promptMode || 'text';
  const isLearning = mode === 'learning';
  const isTest = mode === 'test';

  const [filledSlots, setFilledSlots] = useState<Record<number, string>>({});
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [streak, setStreak] = useState(0);
  const [floatingXP, setFloatingXP] = useState(false);

  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[0] : null;
  const placedWords = useMemo(() => new Set(Object.values(filledSlots)), [filledSlots]);

  const blankWidthPx = useMemo(() => {
    const allWords = [...wordBank, ...blanks.map((b) => b.answer)];
    const maxLen = allWords.reduce((max, w) => Math.max(max, w.length), 0);
    return Math.min(200, Math.max(90, maxLen * 12 + 40));
  }, [wordBank, blanks]);

  const allFilled = blanks.every((b) => filledSlots[b.id]);

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

  // Read scenario/speechText aloud in test + practice mode
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || sentence;
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, sIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFeedbackMsg = (type: 'correct' | 'wrong') => {
    const msg = type === 'correct'
      ? (config.feedbackCorrect || t('game.feedback.perfect'))
      : (config.feedbackWrong || t('game.feedback.notQuite'));
    setFeedback(type);
    setFeedbackMsg(msg);
    if (type === 'wrong' && config.hint) {
      setTimeout(() => setShowHint(true), 600);
    }
    setTimeout(() => { setFeedback(null); setFeedbackMsg(''); setShowHint(false); }, type === 'correct' ? 1500 : 2500);
  };

  // Auto-check when all filled
  useEffect(() => {
    if (!allFilled || completed || feedback) return;
    const timer = setTimeout(() => {
      const allCorrect = blanks.every((b) => filledSlots[b.id]?.toLowerCase() === b.answer.toLowerCase());
      if (allCorrect) {
        if (!isTest && soundOn) playCorrect();
        if (!isTest) showFeedbackMsg('correct');
        setStreak((s) => s + 1);
        setFloatingXP(true);
        setTimeout(() => setFloatingXP(false), 800);
        blanks.forEach((b) => {
          scoreRef.current += 10;
          onAnswer?.({ correct: true, expected: b.answer, given: filledSlots[b.id] });
        });
        setTimeout(() => {
          setFeedback(null);
          setFeedbackMsg('');
          setShowHint(false);
          setFilledSlots({});
          setSelectedWord(null);
          setCompleted(false);
          if (sIdx + 1 >= sentences.length) onComplete(scoreRef.current);
          else setSIdx((i) => i + 1);
        }, 1200);
      } else {
        if (!isTest && soundOn) playWrong();
        if (!isTest) showFeedbackMsg('wrong');
        setStreak(0);
        blanks.forEach((b) => {
          const given = filledSlots[b.id] || '';
          onAnswer?.({ correct: given.toLowerCase() === b.answer.toLowerCase(), expected: b.answer, given });
        });
        setTimeout(() => {
          setFeedback(null);
          setFeedbackMsg('');
          setShowHint(false);
          setFilledSlots({});
          setSelectedWord(null);
          setCompleted(false);
        }, 2000);
      }
      setCompleted(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [allFilled, completed, feedback, blanks, filledSlots, isTest, soundOn, onComplete, onAnswer, sIdx, sentences.length]);

  const handleWordTap = (word: string) => {
    if (feedback || completed) return;
    if (placedWords.has(word)) return;
    if (soundOn) playTap();
    if (selectedWord) {
      setSelectedWord(null);
    } else {
      setSelectedWord(word);
    }
  };

  const handleBlankTap = (blankId: number) => {
    if (feedback || completed) return;
    if (filledSlots[blankId]) {
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

  // Learning mode: scenario auto-speaks via effect above.
  // Answer does NOT auto-play — child taps "Play Answer" to hear it.
  const unfilledBlanks = useMemo(() => blanks.filter((b) => !filledSlots[b.id]), [blanks, filledSlots]);
  const nextBlank = unfilledBlanks[0] || null;
  const [learningAnswerPlayed, setLearningAnswerPlayed] = useState(false);
  useEffect(() => { setLearningAnswerPlayed(false); }, [nextBlank?.id]);

  const playLearningAnswer = useCallback(async () => {
    if (!nextBlank || learningAnswerPlayed) return;
    setLearningAnswerPlayed(true);
    if (soundOn) await speak(nextBlank.answer);
    if (soundOn) playPlace();
    setFilledSlots((prev) => ({ ...prev, [nextBlank.id]: nextBlank.answer }));
  }, [nextBlank, soundOn, learningAnswerPlayed]);

  if (sentences.length === 0 || !currentS) {
    return <p className="text-center text-gray-500">{t('game.noDataFillBlank')}</p>;
  }

  return (
    <div className="space-y-4 relative select-none">
      {/* Character badge */}
      {currentCharacter && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {currentCharacter.image ? (
              <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-full w-full object-cover" />
            ) : currentCharacter.emoji ? (
              <span className="text-2xl">{currentCharacter.emoji}</span>
            ) : (
              <span className="text-lg font-bold text-[#0F4D92]">{currentCharacter.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{currentCharacter.name}</p>
            {currentCharacter.personality && <p className="text-xs text-gray-400">{currentCharacter.personality}</p>}
          </div>
        </div>
      )}

      {/* Scenario card */}
      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Mode badges */}
      {isLearning && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ {t('game.test.fillBlanks')}
        </p>
      )}

      {/* Streak badge */}
      {streak >= 2 && !isTest && (
        <div className="text-center animate-game-pop">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            🔥 {t('game.streak', { count: streak })}
          </span>
        </div>
      )}

      {/* Sentence progress */}
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

      {/* Multimodal sentence presentation */}
      {promptMode === 'audio' ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-semibold text-gray-700">
            {t('game.listenFillBlanks')} 🎧
            <SpeakButton text={config.speechText || config.scenario || sentence.replace(/_+/g, 'blank')} size="sm" className="ml-2 align-middle" />
          </p>
          <div className="rounded-xl bg-purple-50 px-6 py-3 flex items-center gap-2">
            <Volume2 className="h-6 w-6 text-purple-600 animate-game-bounce" />
            <span className="text-sm text-purple-600 font-medium">{t('game.playingSentence')}</span>
          </div>
        </div>
      ) : promptMode === 'image' ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-semibold text-gray-700">
            {t('game.lookCompleteSentence')} 🖼️
            <SpeakButton text={config.speechText || config.scenario || sentence.replace(/_+/g, 'blank')} size="sm" className="ml-2 align-middle" />
          </p>
          {config.image && <CachedImg src={config.image} alt="" className="h-20 w-20 object-contain" />}
        </div>
      ) : (
        <>
          {(currentS.context || sentences.length > 1) && (
            <p className="text-center text-sm text-gray-500">
              {sentences.length > 1 ? t('game.sentenceProgress', { current: sIdx + 1, total: sentences.length }) : ''}
              {currentS.context ? `${sentences.length > 1 ? ' — ' : ''}${currentS.context}` : ''}
            </p>
          )}
          <p className="text-center text-lg font-semibold text-gray-700">
            {t('game.completeSentence')} 📝
            <SpeakButton text={sentence.replace(/_+/g, 'blank')} size="sm" className="ml-2 align-middle" />
          </p>
          <p className="text-center text-xs text-gray-400">{t('game.tapWordBlank')}</p>
        </>
      )}

      {/* Sentence with blank slots */}
      <div className="rounded-2xl bg-white p-6 shadow-md border border-gray-100">
        <div className="flex flex-wrap items-center gap-2 text-xl font-kid-body leading-relaxed">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i} className="text-gray-800">{part.value}</span>;
            }
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
                className={`inline-flex items-center justify-center h-11 rounded-xl border-2 border-dashed px-2 font-bold text-sm transition-all duration-200 ${
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
                style={{ width: blankWidthPx }}
              >
                {filled ? <span className="truncate" style={{ maxWidth: blankWidthPx - 16 }}>{filled}</span> : <span className="text-gray-300">?</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Word bank */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
        <p className="mb-3 text-xs font-medium text-gray-400 text-center">{t('game.wordBank')}</p>
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
                className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all select-none ${
                  isPlaced
                    ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed opacity-50'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md animate-game-jelly scale-105'
                    : draggingWord === word
                    ? 'border-blue-400 bg-blue-50 opacity-50 scale-95'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:shadow-md cursor-grab active:cursor-grabbing'
                }`}
              >
                <span className="whitespace-normal leading-tight">{word}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Play Answer button — learning mode only */}
      {isLearning && !learningAnswerPlayed && !feedback && !completed && nextBlank && (
        <div className="flex justify-center">
          <button
            onClick={playLearningAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-100 border border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition-all hover:scale-105 active:scale-95 animate-game-pop"
          >
            <Volume2 className="h-4 w-4" /> {t('game.playAnswer')} 🔊
          </button>
        </div>
      )}

      {/* Voice input */}
      {config.inputMode !== 'tap' && !allFilled && (
        <div className="flex justify-center">
          <SpeechInput
            expectedAnswers={blanks.filter((b) => !filledSlots[b.id]).map((b) => b.answer)}
            onResult={(spoken, isCorrect) => {
              if (!isCorrect || feedback || completed) return;
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

      {/* Hint */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm font-medium text-amber-800 flex-1">{config.hint}</p>
            <SpeakButton text={config.hint} size="sm" className="ml-1" />
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold max-w-md mx-auto ${
            feedback === 'correct' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
          </div>
        </div>
      )}

      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
        </div>
      )}

      {/* Touch ghost */}
      {touchGhost && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2 font-bold text-sm text-blue-700 shadow-lg animate-game-pop max-w-[140px] text-center"
          style={{ left: touchGhost.x - 50, top: touchGhost.y - 40 }}
        >
          <span className="whitespace-normal leading-tight">{touchGhost.word}</span>
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

  // Multi-question quiz with backward-compatible single-question shape
  const questions = useMemo(() => {
    if (config.questions && config.questions.length > 0) return config.questions;
    return [{
      id: 'q-single',
      prompt: config.question || t('game.chooseAnswer'),
      options: config.options || [],
      correctIndex: -1,
      correctId: config.correctId,
      answer: config.answer,
    }];
  }, [config]);

  const characters = config.characters || [];
  const [qIdx, setQIdx] = useState(0);
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [characterReaction, setCharacterReaction] = useState<'celebrate' | 'think' | null>(null);
  const [floatingXP, setFloatingXP] = useState(false);
  const [streakPopup, setStreakPopup] = useState<number | null>(null);

  const promptMode = config.promptMode || 'text';
  const responseMode = config.responseMode || 'text';
  const isLearning = mode === 'learning';
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [tapping, setTapping] = useState<number | null>(null);
  const isTest = mode === 'test';
  const currentQ = questions[qIdx];
  const options = currentQ?.options || [];
  const isReviewQ = !!(currentQ as any)?.isReview;

  // Resolve character for current question — Image > Emoji > Text
  const currentCharacter = useMemo(() => {
    if (currentQ?.characterName) {
      const found = characters.find(c => c.name === currentQ.characterName);
      return found || {
        name: currentQ.characterName,
        image: currentQ.characterImage,
        emoji: currentQ.characterEmoji || '🧒',
      };
    }
    if (characters.length > 0) {
      return characters[qIdx % characters.length];
    }
    return null;
  }, [currentQ, characters, qIdx]);

  const isCorrectOption = useCallback((idx: number): boolean => {
    const opt = options[idx];
    if (!opt) return false;
    if (typeof currentQ?.correctIndex === 'number' && currentQ.correctIndex >= 0) return idx === currentQ.correctIndex;
    return opt.id === currentQ?.correctId || opt.label === currentQ?.answer;
  }, [options, currentQ]);

  const advance = useCallback((totalScore: number) => {
    setSelectedIdx(null);
    setFeedback(null);
    setFeedbackMsg('');
    setTapping(null);
    setShowHint(false);
    setCharacterReaction(null);
    setFloatingXP(false);
    setStreakPopup(null);
    if (qIdx + 1 >= questions.length) {
      onComplete(totalScore);
    } else {
      setQIdx((i) => i + 1);
      // Track if next question is a review
      const nextQ = questions[qIdx + 1];
    }
  }, [qIdx, questions.length, onComplete]);

  // Streak milestones
  const checkStreakMilestone = useCallback((newStreak: number) => {
    if (newStreak === 3 || newStreak === 5 || newStreak === 7) {
      setStreakPopup(newStreak);
      if (soundOn) playStreak(newStreak);
      setTimeout(() => setStreakPopup(null), 2000);
    }
    // Mini-celebration every 3rd question when on a streak
    if (newStreak > 0 && newStreak % 3 === 0) {
      if (soundOn) playCelebration();
    }
  }, [soundOn]);

  const handleAnswer = (idx: number) => {
    if (feedback) return;
    const isCorrect = isCorrectOption(idx);

    if (!isTest && soundOn) playTap();
    if (!isCorrect || !isTest) {
      setTapping(idx);
      setTimeout(() => setTapping(null), 300);
    }
    onAnswer?.({ correct: isCorrect, expected: currentQ?.answer || currentQ?.correctId || options[currentQ?.correctIndex ?? -1]?.label || '', given: options[idx]?.label || '', question_id: currentQ?.id, lesson_id: currentQ?.lesson_id || config.lessonId, is_review: !!currentQ?.isReview });

    if (isCorrect) {
      if (!isTest && soundOn) playCorrect();
      if (!isTest) {
        setFeedback('correct');
        setFeedbackMsg(currentQ?.feedbackCorrect || '');
        setCharacterReaction('celebrate');
        setFloatingXP(true);
      }
      setSelectedIdx(idx);
      scoreRef.current += 10;
      const newStreak = streak + 1;
      setStreak(newStreak);
      checkStreakMilestone(newStreak);
      setTimeout(() => advance(scoreRef.current), isTest ? 200 : 1000);
    } else if (!isTest) {
      // Wrong answer — gentle feedback with hint
      if (soundOn) playHint();
      setFeedback('wrong');
      setFeedbackMsg(currentQ?.feedbackWrong || '');
      setSelectedIdx(idx);
      setCharacterReaction('think');
      setShowHint(true);
      // In practice mode, allow retry after hint
      setTimeout(() => {
        setFeedback(null);
        setSelectedIdx(null);
        setCharacterReaction(null);
        // Keep hint visible until they try again
      }, 1200);
    }
    // Wrong answer in test mode — silently record, no visual feedback
  };

  // ── Read question aloud in test + practice mode ──
  useEffect(() => {
    if (!currentQ || !soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const textToSpeak = currentQ.speechText || currentQ.scenario || currentQ.prompt || currentQ.question || '';
      if (textToSpeak && !cancelled) {
        await speak(stripEmoji(textToSpeak));
      }
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, qIdx, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Learning mode: question auto-speaks via scenario effect above ──
  // Answer does NOT auto-play — child needs time to think.
  // A "Play Answer" button triggers the answer reveal.
  const [learningAnswerPlayed, setLearningAnswerPlayed] = useState(false);

  // Reset answer-played flag when question changes
  useEffect(() => {
    setLearningAnswerPlayed(false);
  }, [qIdx]);

  const playLearningAnswer = useCallback(async () => {
    if (!currentQ || learningAnswerPlayed) return;
    const correctIdx = options.findIndex((_, i) => isCorrectOption(i));
    if (correctIdx === -1) return;
    setLearningAnswerPlayed(true);
    // Highlight + speak the answer
    if (soundOn) playCorrect();
    setFeedback('correct');
    setCharacterReaction('celebrate');
    setSelectedIdx(correctIdx);
    onAnswer?.({ correct: true, expected: options[correctIdx]?.label || '', given: options[correctIdx]?.label || '' });
    const answerName = speakLabel(options[correctIdx]?.label, undefined, options[correctIdx]?.emoji, config.category);
    if (soundOn) await speakOrPlay(options[correctIdx]?.audio, `The answer is ${answerName}`);
    setTimeout(() => advance(scoreRef.current), 600);
  }, [currentQ, options, soundOn, isCorrectOption, onAnswer, advance, learningAnswerPlayed]);

  if (!currentQ) return null;

  // ── Scenario text: prefer scenario field, fall back to prompt ──
  const scenarioText = currentQ.scenario || '';
  const questionText = currentQ.prompt || currentQ.question || config.question || t('game.chooseAnswer');
  const settingText = currentQ.setting || '';

  return (
    <div className="space-y-5">
      {/* Mode indicator */}
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          📝 {t('game.test.chooseCarefully')}
        </p>
      )}

      {/* Progress dots */}
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

      {/* Streak counter */}
      {streak >= 2 && !isTest && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 px-3 py-1 text-xs font-bold text-white shadow-md animate-game-pop">
            <span>🔥</span>
            <span>{t('game.streak', { count: streak })}</span>
          </div>
        </div>
      )}

      {/* Streak milestone popup */}
      {streakPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-game-trophy-drop text-center">
            <div className="text-5xl mb-2">
              {streakPopup >= 7 ? '🏆' : streakPopup >= 5 ? '⭐' : '🔥'}
            </div>
            <p className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">
              {streakPopup >= 7 ? t('game.unstoppable') : streakPopup >= 5 ? t('game.amazing') : t('game.onFire')}
            </p>
            <p className="text-sm font-bold text-orange-400">{t('game.inARow', { count: streakPopup })}</p>
          </div>
        </div>
      )}

      {/* Character + Scenario Card */}
      <div className="animate-game-drop-in">
        {/* Character badge — Image > Emoji > Text */}
        {currentCharacter && (
          <div className="flex items-center gap-2 mb-2">
            {(currentQ?.characterImage || currentCharacter.image) ? (
              <CachedImg
                src={currentQ?.characterImage || currentCharacter.image}
                alt={currentCharacter.name}
                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm animate-game-pop"
              />
            ) : currentCharacter.emoji ? (
              <span className="text-3xl animate-game-pop" role="img" aria-label={currentCharacter.name}>
                {currentCharacter.emoji}
              </span>
            ) : (
              <span className="h-10 w-10 rounded-full bg-[#0F4D92] flex items-center justify-center text-white text-sm font-bold animate-game-pop">
                {currentCharacter.name.charAt(0)}
              </span>
            )}
            <div>
              <p className="text-sm font-bold text-gray-700">{currentCharacter.name}</p>
              {/* Setting — Image > Text */}
              {currentQ?.settingImage ? (
                <div className="flex items-center gap-1">
                  <CachedImg src={currentQ.settingImage} alt="" className="h-3.5 w-3.5 object-contain" />
                  {settingText && <p className="text-[10px] text-gray-400 font-medium">{settingText}</p>}
                </div>
              ) : settingText ? (
                <p className="text-[10px] text-gray-400 font-medium">{settingText}</p>
              ) : null}
            </div>
            {currentCharacter.personality && (
              <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                {currentCharacter.personality}
              </span>
            )}
          </div>
        )}

        {/* Speech bubble — scenario or question */}
        <div className={`relative rounded-2xl p-5 shadow-sm ${
          currentCharacter
            ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100'
            : 'bg-white border border-gray-100'
        }`}>
          {/* Speech bubble pointer */}
          {currentCharacter && (
            <div className="absolute -top-2 left-8 w-4 h-4 rotate-45 bg-blue-50 border-l border-t border-blue-100" />
          )}

          {/* Scenario text (main display) */}
          {scenarioText ? (
            <p className="text-lg font-medium text-gray-700 leading-relaxed font-kid-body relative z-10">
              {scenarioText}
              <SpeakButton text={scenarioText} size="sm" className="ml-2 align-middle" />
            </p>
          ) : (
            <p className="text-lg font-semibold text-gray-700 font-kid-body relative z-10">
              {questionText}
              <SpeakButton text={questionText} size="sm" className="ml-2 align-middle" />
            </p>
          )}

          {/* Multimodal image/audio prompt */}
          {promptMode === 'image' && (currentQ.image || config.image) && (
            <div className="mt-3 flex justify-center">
              <CachedImg src={currentQ.image || config.image} alt="" className="h-20 w-20 object-contain rounded-xl" />
            </div>
          )}
          {promptMode === 'audio' && (
            <div className="mt-3 flex justify-center">
              <div className="h-14 w-14 rounded-full bg-purple-100 flex items-center justify-center animate-game-bounce">
                <Volume2 className="h-7 w-7 text-purple-600" />
              </div>
            </div>
          )}
          {promptMode === 'context' && !scenarioText && (
            <div className="mt-2 rounded-lg bg-amber-50 px-4 py-2">
              <p className="text-sm font-medium text-amber-800">{config.context || questionText}</p>
            </div>
          )}

          {/* TTS indicator in test mode */}
          {isTest && soundOn && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-400">
              <Volume2 className="h-3 w-3 animate-game-bounce" />
              <span>{t('game.readingAloud')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Answer options — large touch targets */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            disabled={!!feedback && feedback === 'correct'}
            className={`relative rounded-2xl border-2 p-5 text-center font-semibold transition-all animate-game-slide-up stagger-${Math.min(i + 1, 12)} min-h-[72px] ${
              !isTest && feedback === 'correct' && isCorrectOption(i)
                ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} animate-game-correct shadow-lg ${cbCorrect.shadow}`
                : !isTest && selectedIdx === i && feedback === 'wrong'
                ? `${cbWrong.border} ${cbWrong.bg} animate-game-wrong`
                : !isTest && feedback === 'wrong' && !isCorrectOption(i)
                ? 'border-gray-200 bg-white opacity-50 scale-95'
                : tapping === i
                ? 'border-blue-400 bg-blue-50 animate-game-jelly shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-lg hover:animate-game-squish active:scale-95'
            }`}
          >
            {/* Option content */}
            {isLearning ? (
              <>
                {opt.image && <CachedImg src={opt.image} alt={opt.label} className="mx-auto mb-2 h-12 w-12 object-contain" />}
                {opt.emoji && <span className="text-3xl mb-1">{opt.emoji}</span>}
                <span className="text-lg">{opt.label}</span>
              </>
            ) : responseMode === 'image' ? (
              opt.image ? (
                <CachedImg src={opt.image} alt="" className="mx-auto h-16 w-16 object-contain" />
              ) : opt.emoji ? (
                <span className="text-4xl" role="img" aria-label="option">{opt.emoji}</span>
              ) : (
                <span className="text-lg font-bold text-gray-700">{opt.label}</span>
              )
            ) : responseMode === 'audio' ? (
              <span className="flex flex-col items-center gap-1">
                <Volume2 className="h-8 w-8 text-[#0F4D92]" />
                <span className="text-xs text-gray-400">{t('game.tapToHear')}</span>
              </span>
            ) : (
              <span className="text-lg font-semibold text-gray-800 capitalize">{opt.label}</span>
            )}

            {/* Correct checkmark overlay */}
            {!isTest && feedback === 'correct' && isCorrectOption(i) && (
              <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-green-500 flex items-center justify-center shadow-md animate-game-pop">
                <span className="text-white text-sm">✓</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Play Answer button — learning mode only, lets child think before hearing answer */}
      {isLearning && !learningAnswerPlayed && !feedback && (
        <div className="flex justify-center">
          <button
            onClick={playLearningAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-100 border border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition-all hover:scale-105 active:scale-95 animate-game-pop"
          >
            <Volume2 className="h-4 w-4" /> {t('game.playAnswer')} 🔊
          </button>
        </div>
      )}

      {/* Hint (shown after wrong answer) */}
      {showHint && currentQ.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm font-medium text-amber-800 flex-1">{currentQ.hint}</p>
            <SpeakButton text={currentQ.hint} size="sm" className="ml-1" />
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold ${
            feedback === 'correct'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
            {feedback === 'correct' && isReviewQ && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 align-middle">
                🔄 Review mastered!
              </span>
            )}
          </div>
        </div>
      )}

      {/* Floating XP on correct */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
        </div>
      )}

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

/* ── Memory Pairs Game (flip-card concentration) ───────────── */

interface MemoryCard {
  key: string;      // unique per card instance
  itemId: string;   // pairs via `matches`
  image?: string;
  audio?: string;
  label: string;
  partnerKey: string;
}

function MemoryPairsGame({
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
  const isLearning = mode === 'learning';
  const isTest = mode === 'test';

  const deck = useMemo<MemoryCard[]>(() => {
    const rawItems = (config.items || []).filter((it) => it.id);
    const byId = new Map(rawItems.map((it) => [it.id!, it]));
    const seen = new Set<string>();
    const cards: MemoryCard[] = [];
    for (const it of rawItems) {
      if (!it.id || seen.has(it.id)) continue;
      const partner = byId.get(it.matches || '');
      if (!partner?.id || seen.has(partner.id)) continue;
      cards.push({ key: `${it.id}-a`, itemId: it.id, image: it.image, audio: it.audio, label: String(it.id), partnerKey: '' });
      cards[cards.length - 1].partnerKey = `${partner.id}-b`;
      cards.push({ key: `${partner.id}-b`, itemId: partner.id, image: partner.image, audio: partner.audio, label: String(partner.id), partnerKey: `${it.id}-a` });
      seen.add(it.id);
      seen.add(partner.id);
    }
    return shuffle(cards);
  }, [config]);

  const totalPairs = deck.length / 2;
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matchedKeys, setMatchedKeys] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [floatingXP, setFloatingXP] = useState(false);
  const scoreRef = useRef(0);

  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[0] : null;

  // Read scenario/prompt aloud in test + practice mode
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || '';
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const showFeedbackMsg = (type: 'correct' | 'wrong') => {
    if (isTest) return;
    const msg = type === 'correct'
      ? (config.feedbackCorrect || t('game.feedback.perfect'))
      : (config.feedbackWrong || t('game.feedback.notQuite'));
    setFeedback(type);
    setFeedbackMsg(msg);
    if (type === 'wrong' && config.hint) {
      setTimeout(() => setShowHint(true), 600);
    }
    setTimeout(() => { setFeedback(null); setFeedbackMsg(''); setShowHint(false); }, type === 'correct' ? 1200 : 2000);
  };

  // Learning mode auto-play
  useEffect(() => {
    if (!isLearning || matchedKeys.size >= totalPairs * 2 || totalPairs === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const remaining = deck
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !matchedKeys.has(c.key));
      if (remaining.length < 2) return;
      const first = remaining[0];
      const second = remaining.find(({ c }) => c.key === first.c.partnerKey);
      if (!second) return;
      setFlipped([first.i, second.i]);
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled) return;
      if (soundOn) playMatch();
      if (soundOn && first.c.audio) speakOrPlay(first.c.audio);
      setMatchedKeys((prev) => new Set(prev).add(first.c.key).add(second.c.key));
      setFlipped([]);
      scoreRef.current += 10;
      onAnswer?.({ correct: true, expected: second.c.label, given: first.c.label });
      if (matchedKeys.size + 2 >= totalPairs * 2) onComplete(scoreRef.current);
    }, 900);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isLearning, matchedKeys, deck, totalPairs, soundOn, onComplete, onAnswer]);

  const handleFlip = (idx: number) => {
    if (locked || isLearning) return;
    if (flipped.includes(idx) || matchedKeys.has(deck[idx].key)) return;
    if (!isTest && soundOn) playTap();
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length < 2) return;

    const [a, b] = next;
    const ca = deck[a];
    const cb = deck[b];
    const isMatch = ca.partnerKey === cb.key && cb.partnerKey === ca.key;

    if (isMatch) {
      if (!isTest && soundOn) playMatch();
      setMatchedKeys((prev) => new Set(prev).add(ca.key).add(cb.key));
      setFlipped([]);
      scoreRef.current += 10;
      setStreak((s) => s + 1);
      setFloatingXP(true);
      setTimeout(() => setFloatingXP(false), 800);
      if (!isTest) showFeedbackMsg('correct');
      if (!isTest && streak > 0 && streak % 3 === 2 && soundOn) playStreak(Math.floor(streak / 3));
      onAnswer?.({ correct: true, expected: cb.label, given: ca.label });
      if (matchedKeys.size + 2 >= totalPairs * 2) {
        setTimeout(() => onComplete(scoreRef.current), isTest ? 300 : 600);
      }
    } else {
      setStreak(0);
      if (!isTest && soundOn) playWrong();
      if (!isTest) showFeedbackMsg('wrong');
      setWrongPair(next);
      setLocked(true);
      onAnswer?.({ correct: false, expected: ca.label, given: cb.label });
      setTimeout(() => {
        setFlipped([]);
        setWrongPair([]);
        setLocked(false);
      }, isTest ? 400 : 800);
    }
  };

  if (totalPairs === 0) {
    return <p className="text-center text-gray-500">{t('game.noDataMemoryPairs')}</p>;
  }

  return (
    <div className="space-y-4 select-none">
      {/* Character badge */}
      {currentCharacter && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {currentCharacter.image ? (
              <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-full w-full object-cover" />
            ) : currentCharacter.emoji ? (
              <span className="text-2xl">{currentCharacter.emoji}</span>
            ) : (
              <span className="text-lg font-bold text-[#0F4D92]">{currentCharacter.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{currentCharacter.name}</p>
            {currentCharacter.personality && <p className="text-xs text-gray-400">{currentCharacter.personality}</p>}
          </div>
        </div>
      )}

      {/* Scenario card */}
      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Mode badges */}
      {isLearning && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ {t('game.test.findPairs')}
        </p>
      )}

      {/* Streak badge */}
      {streak >= 2 && !isTest && (
        <div className="text-center animate-game-pop">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            🔥 {t('game.streakPairs', { count: streak })}
          </span>
        </div>
      )}

      {/* Progress dots */}
      {!isLearning && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: totalPairs }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i < matchedKeys.size / 2 ? 'bg-green-400' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}

      <p className="text-center text-lg font-semibold text-gray-700">            {config.scenario || `${t('game.findMatchingPairs')} 🃏`}
        <SpeakButton text={config.speechText || config.scenario || `${t('game.findMatchingPairs')} 🃏`} size="sm" className="ml-2 align-middle" />
      </p>

      <div className={`grid gap-3 ${totalPairs <= 4 ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-4'}`}>
        {deck.map((card, i) => {
          const isUp = flipped.includes(i) || matchedKeys.has(card.key);
          const isWrong = wrongPair.includes(i);
          const isMatched = matchedKeys.has(card.key);
          return (
            <button
              key={card.key}
              onClick={() => handleFlip(i)}
              aria-label={isUp ? card.label : 'Hidden card'}
              className={`flex aspect-square items-center justify-center rounded-2xl border-2 p-2 transition-all duration-200 ${
                isMatched
                  ? `${cbCorrect.border} ${cbCorrect.bg} opacity-60 shadow-inner`
                  : isWrong
                  ? `${cbWrong.border} ${cbWrong.bg} animate-game-wrong`
                  : isUp
                  ? 'border-[#0F4D92] bg-white shadow-md scale-105'
                  : 'border-gray-200 bg-gradient-to-br from-[#0F4D92] to-blue-400 hover:border-blue-300 hover:shadow-lg active:scale-95'
              }`}
            >
              {isUp ? (
                card.image ? (
                  <CachedImg src={card.image} alt={card.label} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xl font-bold text-gray-600">{card.label.slice(0, 2).toUpperCase()}</span>
                )
              ) : (
                <span className="text-2xl text-white/90">?</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm font-medium text-amber-800">{config.hint}</p>
          </div>
        </div>
      )}

      {/* Feedback message */}
      {feedback && feedbackMsg && (
        <div className="animate-game-pop">
          <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold max-w-md mx-auto ${
            feedback === 'correct' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {feedback === 'correct' ? '🎉 ' : '🤔 '}{feedbackMsg}
          </div>
        </div>
      )}

      {/* Floating XP */}
      {floatingXP && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-game-pop">
          <span className="text-2xl font-extrabold text-amber-500 drop-shadow-lg">{t('game.xp', { count: 10 })}</span>
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
        <h1 className="mb-2 text-2xl font-bold text-gray-800 animate-game-slide-up stagger-1">{t('game.testComplete')}</h1>
        <p className="mb-6 text-sm text-gray-500 animate-game-slide-up stagger-2">{t('game.readySubmit')}</p>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md animate-game-slide-up stagger-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#0F4D92]">{totalAnswered}</p>
              <p className="text-xs text-gray-500">{t('game.answered')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{totalPossible}</p>
              <p className="text-xs text-gray-500">{t('game.totalQuestions')}</p>
            </div>
          </div>
          {totalAnswered < totalPossible && (
            <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg py-1.5">
              ⚠️ {tN('game.unanswered', totalPossible - totalAnswered)}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center animate-game-slide-up stagger-4">
          <button
            onClick={() => { playTap(); onSubmit(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 animate-game-spring-in stagger-4"
          >
            {t('game.submitTest')} ✓
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all animate-game-spring-in stagger-5"
          >
            {t('game.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Result Breakdown ──────────────────────────────────────── */

/** Q1 Phase 2: ADE v2 next-item recommendation (weakest skills first). */
type NextRec = {
  skill_key: string;
  lesson_id: string | null;
  difficulty: number;
  reason: string;
  mastery_probability: number;
};

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
          {pct >= 80 ? t('game.result.superStar') : pct >= 50 ? t('game.result.greatJob') : pct > 0 ? t('game.result.keepTrying') : t('game.result.timesUp')}
        </h1>
        {pct >= 80 && (
          <p className="mb-2 animate-game-pop text-xl font-extrabold tracking-wide text-amber-500">
            {t('game.result.youAreSuperStar')}
          </p>
        )}
        <p className="mb-4 text-gray-500 animate-game-slide-up stagger-1">
          {mode === 'test' ? t('game.results.test') : t('game.results.practice')}
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
          <p className="mb-3 text-4xl font-bold text-[#0F4D92] animate-game-score-bounce">{t('game.xpScore', { count: score })}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className={`text-2xl font-bold ${cbCorrect.text}`}>{correct}</p>
              <p className="text-xs text-gray-500">{t('game.correct')}</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${cbWrong.text}`}>{wrong}</p>
              <p className="text-xs text-gray-500">{t('game.wrong')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{pct}%</p>
              <p className="text-xs text-gray-500">{t('game.score')}</p>
            </div>
          </div>
        </div>

        {/* Answer review (test mode only) */}
        {mode === 'test' && answers.length > 0 && (
          <div className="mb-6 text-left animate-game-slide-up stagger-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-600">{t('game.answerReview')}</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl bg-white p-3 shadow-sm">
              {answers.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm animate-game-slide-up stagger-${Math.min(i + 6, 12)} ${a.correct ? cbCorrect.text : cbWrong.text}`}>
                  {a.correct
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 animate-game-pop" />
                    : <XCircle className="h-4 w-4 shrink-0 animate-game-pop" />
                  }
                  <span className="truncate">
                    {a.correct ? a.expected : t('game.yoursCorrect', { given: a.given, expected: a.expected })}
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
            <RotateCcw className="h-4 w-4" /> {t('game.playAgain')}
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 hover:animate-game-squish active:scale-95"
          >
            {t('game.backToGames')}
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
        <h1 className="mb-2 text-3xl font-bold text-gray-800 animate-game-spring-in">{t('game.result.superStar')}</h1>
        <p className="mb-1 animate-game-pop text-xl font-extrabold tracking-wide text-amber-500">
          {t('game.result.youAreSuperStar')}
        </p>
        <p className="mb-6 text-sm text-gray-500 animate-game-slide-up stagger-1">
          {t('game.watchedAndLearned', { lesson: lessonTitle, count: totalItems })}
        </p>
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-md animate-game-slide-up stagger-2">
          <p className="text-sm text-gray-600">
            {t('game.greatJobWatching')} <span className="font-bold text-green-700">{t('game.practiceMode')}</span> to test yourself,
            or <span className="font-bold text-blue-700">{t('game.testMode')}</span> to earn stars and XP!
          </p>
        </div>
        <div className="flex gap-3 justify-center animate-game-slide-up stagger-3">
          <button
            onClick={() => { playTap(); onRestart(); }}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 transition-all hover:scale-105 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" /> {t('game.watchAgain')}
          </button>
          <button
            onClick={() => { playTap(); onBack(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 active:scale-95"
          >
            {t('game.backToGames')}
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
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [completed, setCompleted] = useState(false);
  const [celebrateSlot, setCelebrateSlot] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [floatingXP, setFloatingXP] = useState(false);

  const characters = config.characters || [];
  const currentCharacter = characters.length > 0 ? characters[0] : null;

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
        if (!isTest) {
          setFeedback('correct');
          setFeedbackMsg(config.feedbackCorrect || t('game.feedback.puzzlePerfect'));
          setFloatingXP(true);
          setTimeout(() => setFloatingXP(false), 800);
        }
        setStreak((s) => s + 1);
        const pts = totalPieces * 10;
        setScore(pts);
        pieces.forEach((p) => onAnswer?.({ correct: true, expected: `row ${p.row} col ${p.col}`, given: p.id }));
        setTimeout(() => onComplete(pts), isTest ? 300 : 1200);
      } else {
        if (!isTest && soundOn) playWrong();
        setStreak(0);
        if (!isTest) {
          setFeedback('wrong');
          setFeedbackMsg(config.feedbackWrong || t('game.feedback.puzzleWrong'));
          if (config.hint) setTimeout(() => setShowHint(true), 600);
        }
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
          setFeedbackMsg('');
          setShowHint(false);
          setPlaced({});
          setCompleted(false);
        }, isTest ? 400 : 1500);
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

  // Learning mode: scenario auto-speaks via effect above.
  // Answer does NOT auto-play — child taps "Play Answer" to hear it.
  const nextPuzzleSlot = useMemo(() => {
    const unfilled = Array.from({ length: totalPieces }, (_, i) => i).filter((i) => !placed[i]);
    return unfilled.length > 0 ? unfilled[0] : null;
  }, [totalPieces, placed]);
  const nextPuzzlePiece = useMemo(() => {
    if (nextPuzzleSlot === null) return null;
    return pieces.find((p) => p.row === Math.floor(nextPuzzleSlot / grid.cols) && p.col === nextPuzzleSlot % grid.cols) || null;
  }, [nextPuzzleSlot, pieces, grid]);
  const [learningAnswerPlayed, setLearningAnswerPlayed] = useState(false);
  useEffect(() => { setLearningAnswerPlayed(false); }, [nextPuzzleSlot]);

  const playLearningAnswer = useCallback(async () => {
    if (!nextPuzzlePiece || !nextPuzzleSlot || learningAnswerPlayed) return;
    setLearningAnswerPlayed(true);
    if (soundOn) await speak(`Row ${nextPuzzlePiece.row + 1}, Column ${nextPuzzlePiece.col + 1}`);
    if (soundOn) playPlace();
    setPlaced((prev) => ({ ...prev, [nextPuzzleSlot]: nextPuzzlePiece.id }));
  }, [nextPuzzlePiece, nextPuzzleSlot, soundOn, learningAnswerPlayed]);

  // Read scenario/prompt aloud in test + practice mode
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const text = config.speechText || config.scenario || '';
      if (text && !cancelled) await speak(stripEmoji(text));
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <p className="text-center text-lg font-semibold text-gray-700">{t('game.choosePuzzleDifficulty')} 🧩</p>
        <p className="text-center text-xs text-gray-400">{t('game.harderMorePieces')}</p>
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
                  <p className="text-[10px] text-gray-400 mt-1">{t('game.bestFor', { age: level.minAge })}</p>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { playTap(); handleDifficultyChange(selectedDifficulty); setShowDifficultyPicker(false); }}
          className="w-full rounded-xl bg-[#0F4D92] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#0D3F7A] transition-all hover:scale-105 active:scale-95"
        >
          {t('game.startPuzzle')} 🧩
        </button>
      </div>
    );
  }

  if (pieces.length === 0) {
    return <p className="text-center text-gray-500">{t('game.noDataPuzzle')}</p>;
  }

  const diffMeta = DIFFICULTY_META[selectedDifficulty] || DIFFICULTY_META.medium;

  return (
    <div className="space-y-4 relative select-none">
      {/* Character badge */}
      {currentCharacter && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {currentCharacter.image ? (
              <CachedImg src={currentCharacter.image} alt={currentCharacter.name} className="h-full w-full object-cover" />
            ) : currentCharacter.emoji ? (
              <span className="text-2xl">{currentCharacter.emoji}</span>
            ) : (
              <span className="text-lg font-bold text-[#0F4D92]">{currentCharacter.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800">{currentCharacter.name}</p>
            {currentCharacter.personality && <p className="text-xs text-gray-400">{currentCharacter.personality}</p>}
          </div>
        </div>
      )}

      {/* Scenario card */}
      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Mode badges */}
      {mode === 'learning' && (
        <p className="text-center text-sm font-medium text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
          📺 {t('game.learning.watchAndLearn')}
        </p>
      )}
      {isTest && (
        <p className="text-center text-sm font-medium text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          ⚠️ {t('game.test.solvePuzzle')}
        </p>
      )}

      {/* Streak badge */}
      {streak >= 2 && !isTest && (
        <div className="text-center animate-game-pop">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">
            🔥 {t('game.streakPuzzles', { count: streak })}
          </span>
        </div>
      )}

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        <div className={`h-2.5 w-2.5 rounded-full transition-all ${placedCount >= totalPieces ? 'bg-green-400' : 'bg-gray-200'}`} />
        <span className="text-xs text-gray-400 self-center">{t('game.itemsPlaced', { placed: placedCount, total: totalPieces })}</span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <p className="text-lg font-semibold text-gray-700">
          {config.scenario ? t('game.putPuzzleTogether') : `${t('game.solvePuzzle')} 🧩`}
          <SpeakButton text={config.speechText || config.scenario || (config.scenario ? t('game.putPuzzleTogether') : t('game.solvePuzzle'))} size="sm" className="ml-2 align-middle" />
        </p>
        {hasLevels && (
          <button
            onClick={() => { playTap(); setShowDifficultyPicker(true); }}
            className={`rounded-xl border px-3 py-1 text-xs font-semibold transition-all ${diffMeta.color} hover:shadow-md`}
          >
            {diffMeta.emoji} {diffMeta.label}
          </button>
        )}
      </div>
      <p className="text-center text-xs text-gray-400">{t('game.puzzleInstructions', { rows: grid.rows, cols: grid.cols, count: totalPieces })}</p>
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
        <p className="mb-3 text-xs font-medium text-gray-400 text-center">{t('game.pieceBank')}</p>
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
      {/* Floating XP */}
      {floatingXP && (
        <div className="absolute top-2 right-4 z-30 animate-game-pop">
          <span className="text-lg font-extrabold text-green-500 drop-shadow-md">{t('game.xp', { count: 10 })}</span>
        </div>
      )}
      {/* Play Answer button — learning mode only */}
      {mode === 'learning' && !learningAnswerPlayed && !feedback && !completed && nextPuzzlePiece && (
        <div className="flex justify-center">
          <button
            onClick={playLearningAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-100 border border-purple-200 px-5 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-200 transition-all hover:scale-105 active:scale-95 animate-game-pop"
          >
            <Volume2 className="h-4 w-4" /> {t('game.playAnswer')} 🔊
          </button>
        </div>
      )}
      {/* Feedback banner (inline, not full overlay) */}
      {feedback && (
        <div className={`animate-game-slide-up rounded-xl border px-4 py-3 text-center ${
          feedback === 'correct' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <p className={`text-sm font-bold ${feedback === 'correct' ? 'text-green-700' : 'text-amber-700'}`}>
            {feedback === 'correct' ? t('game.perfectPuzzle') : t('game.notQuitePuzzle')}
          </p>
          {feedbackMsg && (
            <p className={`text-xs mt-1 ${feedback === 'correct' ? 'text-green-600' : 'text-amber-600'}`}>{feedbackMsg}</p>
          )}
        </div>
      )}
      {/* Hint panel */}
      {showHint && config.hint && (
        <div className="animate-game-slide-up">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 max-w-md mx-auto">
            <span className="text-xl mt-0.5">💡</span>
            <p className="text-sm text-amber-800 flex-1">{config.hint}</p>
            <SpeakButton text={config.hint} size="sm" className="ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Game Chain Game ─────────────────────────────────────────── */

/**
 * GameChainGame — ONE lesson that plays an ORDERED sequence of whole
 * sub-game rounds (e.g. drag-sort → label-diagram → memory-pairs) as a single
 * scored session. Rounds run in array order (simple → complex, never
 * shuffled); each round is a full sub-game rendered by its own component.
 * Score accumulates across rounds; the parent's onComplete fires once with
 * the chain total when the LAST round finishes.
 */
function GameChainGame({
  config, onComplete, soundOn, mode, onAnswer,
}: {
  config: any;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: AnswerResult) => void;
}) {
  const rounds = useMemo(
    () => (Array.isArray(config?.rounds) ? config.rounds.filter((r: any) => r && r.id && r.template && r.config) : []),
    [config],
  );
  const [roundIdx, setRoundIdx] = useState(0);
  const [roundDone, setRoundDone] = useState(false);
  const totalRef = useRef(0);
  const round = rounds[roundIdx];

  const isTest = mode === 'test';
  const isLearning = mode === 'learning';

  // TTS the scenario once at chain start.
  const introSpoken = useRef(false);
  useEffect(() => {
    if (introSpoken.current || !soundOn) return;
    introSpoken.current = true;
    const text = config?.speechText || config?.scenario || '';
    const timer = setTimeout(() => speak(text).catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance after a round completes; fire parent onComplete on the last round.
  const handleRoundComplete = useCallback(
    (roundScore: number) => {
      totalRef.current += roundScore;
      if (roundIdx + 1 >= rounds.length) {
        if (soundOn && !isLearning) playComplete();
        onComplete(totalRef.current);
      } else {
        setRoundDone(true);
        setTimeout(() => {
          setRoundIdx((i) => i + 1);
          setRoundDone(false);
        }, 900);
      }
    },
    [roundIdx, rounds.length, soundOn, isLearning, onComplete],
  );

  // Forward sub-game answers, tagging the round so the result breakdown stays unique.
  const handleRoundAnswer = useCallback(
    (r: AnswerResult) => {
      onAnswer?.({
        ...r,
        question_id: r.question_id ? `${round?.id || 'round'}:${r.question_id}` : round?.id,
        lesson_id: r.lesson_id || config?.lessonId,
      });
    },
    [onAnswer, round, config?.lessonId],
  );

  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-800">{t('game.gameChain.noRounds')}</p>
        <button type="button" onClick={() => onComplete(0)} className="mt-3 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white">{t('common.done')}</button>
      </div>
    );
  }

  const roundProps = {
    soundOn,
    mode,
    onComplete: handleRoundComplete,
    onAnswer: handleRoundAnswer,
  };

  const renderRound = (r: any) => {
    const cfg = { ...(r.config || {}), template: r.template, lessonId: r.config?.lessonId || config?.lessonId };
    switch (r.template) {
      case 'matching': return <MatchingGame config={cfg} {...roundProps} />;
      case 'tap-recognition': return <TapGame config={cfg} {...roundProps} />;
      case 'drag-sort': return <DragSortGame config={cfg} {...roundProps} />;
      case 'quiz': return <QuizGame config={cfg} {...roundProps} />;
      case 'fill-in-blank': return <FillBlankGame config={cfg} {...roundProps} />;
      case 'memory-pairs': return <MemoryPairsGame config={cfg} {...roundProps} />;
      // puzzle-split is excluded from chains by the schema (difficulty-ladder
      // scoring does not fit a linear chain) — falls through to unsupported.
      case 'label-diagram': return <LabelDiagramGame config={cfg as any} {...roundProps} />;
      case 'stage-sequence': return <StageSequenceGame config={cfg as any} {...roundProps} />;
      default: return (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-6 text-center">
          <p className="text-sm font-medium text-amber-800">{t('game.gameChain.unsupportedRound', { template: r.template })}</p>
          <button type="button" onClick={() => handleRoundComplete(0)} className="mt-3 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white">{t('common.next')} →</button>
        </div>
      );
    }
  };

  return (
    <div className="space-y-4 select-none">
      {/* Round progress strip — IN ORDER, never shuffled */}
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-[#0F4D92]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F4D92]">
          {t('game.gameChain.round', { current: roundIdx + 1, total: rounds.length })}
        </span>
        <div className="flex items-center gap-1.5">
          {rounds.map((r: any, i: number) => (
            <div
              key={r.id}
              title={r.label || r.template}
              className={`h-2.5 w-2.5 rounded-full transition-all ${i < roundIdx ? 'bg-green-400' : i === roundIdx ? 'bg-[#0F4D92] animate-game-glow-pulse w-4' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      </div>

      {/* Round label banner */}
      {round?.label && (
        <p className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-2 text-center text-sm font-medium text-purple-600">
          {round.label}
        </p>
      )}

      {roundDone && roundIdx + 1 < rounds.length && (
        <p className="animate-game-pop text-center text-sm font-bold text-green-600">{t('game.gameChain.roundComplete')} 🎉</p>
      )}

      {round && (
        <div key={round.id} className="animate-game-slide-up">
          {renderRound(round)}
        </div>
      )}
    </div>
  );
}

/* ── Main GamePlay Page ────────────────────────────────────── */

export default function GamePlay({ initialConfig }: { initialConfig?: { config: any; scenes?: SceneText[] } }) {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Preview mode: staff/teacher play-test any content_state before submit/approval.
  // True when the URL asks for preview OR a draft config was passed in-memory (pre-submit).
  const isPreview = searchParams.get('preview') === '1' || !!initialConfig;
  const urlMode = (searchParams.get('mode') || '').toLowerCase();
  const validUrlMode = (['learning', 'practice', 'test'] as string[]).includes(urlMode) ? urlMode as GameMode : null;
  // SRE v2 review session: set by ReviewZone → GamePlay grades the SM-2+ card
  // (POST /kids/reviews/v2/complete) when this game completes.
  const isReviewSession = searchParams.get('review') === '1';
  const reviewSkillKey = searchParams.get('skill') || '';
  const reviewItemId = searchParams.get('item') || lessonId || '';
  // E6: Boss raid URL params
  const urlBossMode = searchParams.get('boss_mode');
  const urlRaidId = searchParams.get('raid_id');
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
  // Freemium gate: set when backend responds 403 SUBSCRIPTION_REQUIRED.
  const [gate, setGate] = useState<{ locked: boolean; freeLimit: number; freeRemaining: number; dailyLessonId: string | null; dailyPlayed: boolean; message: string; childFriendly?: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  // Locked-game sound: play the iconic "locked" motif once per gate state.
  // Gate is set from a 403 payload; an effect ensures it fires even when the
  // browser blocks autoplay before any user gesture.
  useEffect(() => {
    if (gate?.locked && soundOn) {
      try { playLocked(); } catch { /* audio unavailable */ }
    }
  }, [gate?.locked]);
  const [sceneSpeaking, setSceneSpeaking] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const [scoreBounce, setScoreBounce] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const [showBreakSuggestion, setShowBreakSuggestion] = useState(false);
  const [breakDismissed, setBreakDismissed] = useState(false);
  // E6: Boss raid state
  const [bossMode, setBossMode] = useState(false);
  const [raidId, setRaidId] = useState<string | null>(null);
  const [bossKey, setBossKey] = useState<string | null>(null);
  const comboRef = useRef<ComboState>({ current: 0, max: 0, rageCounter: 0, rageActive: false, rageRemaining: 0 });
  const [rageActive, setRageActive] = useState(false);
  // Review mixing: track which questions are reviews from failed items
  const [mergedQuestions, setMergedQuestions] = useState<any[] | null>(null);
  const reviewQuestionIds = useRef(new Set<string>());
  const [comboCount, setComboCount] = useState(0);
  const [puzzleDifficulty, setPuzzleDifficulty] = useState<string>('easy');
  const sessionStartRef = useRef(Date.now());
  const { colorblindMode, toggleColorblind } = useA11yStore();

  // Adaptive difficulty state
  const [adaptiveProfile, setAdaptiveProfile] = useState<{ difficulty: number; mastery_pct: number; streak_days: number } | null>(null);
  const adaptiveFetched = useRef(false);

  // Q1 Phase 2 (SRS §12.2): ADE v2 next-item selection — weakest skills first.
  // Populated after each game completes; the result screen renders the panel.
  const [nextRecs, setNextRecs] = useState<NextRec[] | null>(null);

  // Mode lock state (Teacher > Parent > Child hierarchy)
  const [modeLock, setModeLock] = useState<{ locked_mode: string; locked_by_role: string; locked_by_name?: string; class_code?: string } | null>(null);
  const [modeLocked, setModeLocked] = useState(false);

  // E2: offline sync — queued progress count for the banner
  const [queuedCount, setQueuedCount] = useState(0);

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
    if (config.template === 'memory-pairs') return Math.floor((config.items?.length || 0) / 2);
    if (config.template === 'fill-in-blank') return config.blanks?.length || 0;
    if (config.template === 'puzzle-split') return config.pieces?.length || 0;
    if (config.template === 'label-diagram') return (config as any).hotspots?.length || 0;
    if (config.template === 'stage-sequence') return (config as any).assessment?.length || 1;
    if (config.template === 'game-chain') {
      const rounds = (config as any).rounds || [];
      return rounds.reduce((sum: number, r: any) => {
        const c = r?.config || {};
        switch (r?.template) {
          case 'matching': return sum + (c.pairs?.length || 0);
          case 'tap-recognition': return sum + (c.items?.length || 0);
          case 'drag-sort': return sum + (c.items?.length || 0);
          case 'quiz': return sum + (c.questions?.length || (c.options?.length ? 1 : 0));
          case 'fill-in-blank': return sum + (c.blanks?.length || c.sentences?.length || 0);
          case 'memory-pairs': return sum + Math.floor((c.items?.length || 0) / 2);
          case 'puzzle-split': return sum + (c.pieces?.length || 0);
          case 'label-diagram': return sum + (c.hotspots?.length || 0);
          case 'stage-sequence': return sum + (c.assessment?.length || 1);
          default: return sum;
        }
      }, 0);
    }
    return 0;
  }, [config]);

  const durationSec = config?.durationSec || 60;

  // ── Illustrated story (scene v2) state ───────────────────────────────
  const [sceneLibrary, setSceneLibrary] = useState<SceneLibrary>({});
  // Approved backgrounds/characters for visual cards (defaults ship in the
  // scenes util when the endpoint is unavailable/offline).
  useEffect(() => {
    apiClient
      .get(ENDPOINTS.STORY.SCENE_LIBRARY)
      .then((res) => {
        const data = res.data?.data || {};
        if (data && typeof data === 'object') setSceneLibrary(data);
      })
      .catch(() => {}); // defaults cover offline / permission gaps
  }, []);

  // Flatten wrapper scenes into one ordered card list + detect visual stories.
  const storyCards: NormalizedScene[] = useMemo(
    () => flattenScenes(scenes as unknown as any[]),
    [scenes],
  );
  const v2Story = useMemo(() => isVisualStory(storyCards), [storyCards]);
  const v2Active = phase === 'intro' && storyCards.length > 0 && v2Story;
  const currentCard: NormalizedScene | null = v2Active ? storyCards[sceneIdx] ?? null : null;

  // Advance the v2 story pager (or start the game after the last card).
  const storyNext = useCallback(() => {
    if (sceneIdx + 1 < storyCards.length) {
      setSceneIdx((i) => i + 1);
    } else {
      setPhase('play');
      setTimerKey((k) => k + 1);
      setTimerRunning(mode === 'test');
    }
  }, [sceneIdx, storyCards.length, mode]);

  // game_checkpoint → start this lesson's own game, or open the referenced
  // lesson's game (preview semantics in review mode, real play otherwise).
  const launchCheckpoint = useCallback(
    (card: NormalizedScene) => {
      if (card.gameId && card.gameId !== lessonId) {
        navigate(`/play/${encodeURIComponent(card.gameId)}${isPreview ? '?preview=1' : ''}`);
        return;
      }
      storyNext();
    },
    [lessonId, isPreview, navigate, storyNext],
  );


  // E2: offline sync service — init once; keep queued count for banner
  useEffect(() => {
    offlineSync.init({ onStatusChange: (_s, size) => setQueuedCount(size) });
    offlineSync.getStatus().queueSize.then((n) => setQueuedCount(n)).catch(() => {});
  }, []);

  // Load game data
  useEffect(() => {
    if (initialConfig) {
      // Pre-submit draft preview: use the in-memory config directly (no fetch).
      setConfig(initialConfig.config);
      if (Array.isArray(initialConfig.scenes) && initialConfig.scenes.length > 0) {
        setScenes([{ scenes: initialConfig.scenes }]);
      }
      setLoading(false);
      return;
    }
    if (!lessonId) return;
    setLoading(true);
    // Freemium: capture SUBSCRIPTION_REQUIRED 403 (free games used up) so we
    // can show subscribe/lock UI instead of a generic "Game not found".
    const gateFail = (err: any) => {
      const d = err?.data || {};
      if (err?.status === 403 && d?.error_code === 'SUBSCRIPTION_REQUIRED') {
        setGate({ locked: true, freeLimit: d.free_limit ?? 5, freeRemaining: d.freeRemaining ?? 0, dailyLessonId: d.dailyLessonId ?? null, dailyPlayed: !!d.dailyPlayed, message: err.message });
      } else if (err?.status === 403 && d?.error_code === 'SCHOOL_NOT_SUBSCRIBED') {
        // Real school whose trial ended: kids NEVER see payments — this is a
        // gentle "no subscription" screen; the message asks them to tell an adult.
        setGate({ locked: true, freeLimit: 0, freeRemaining: 0, dailyLessonId: null, dailyPlayed: false, message: d.message || 'Your school\'s subscription has ended.', childFriendly: true });
      }
      return { data: null };
    };
    Promise.all([
      apiClient.get(isPreview ? ENDPOINTS.LESSONS.GAME_PREVIEW(lessonId) : ENDPOINTS.LESSONS.GAME(lessonId)).catch(gateFail),
      isPreview
        ? Promise.resolve({ data: { data: [] } })
        : apiClient.get(ENDPOINTS.LESSONS.SCENES(lessonId)).catch(() => ({ data: { data: [] } })),
    ])
      .then(async ([gameRes, scenesRes]) => {
        // E3-offline: fresh payload → cache it; fetch failed → play last downloaded copy
        let gameData: any = gameRes.data?.data || gameRes.data;
        if (gameData?.template) {
          if (!isPreview) offlineContent.saveGamePayload(lessonId, gameData).catch(() => {});
        } else {
          const cachedGame = await offlineContent.loadGamePayload(lessonId).catch(() => null);
          if (cachedGame && (cachedGame as any)?.template) gameData = cachedGame;
        }
        if (gameData?.template) setConfig(gameData);

        let sceneData: any = isPreview
          ? (gameData?.scenes ?? [])
          : (scenesRes.data?.data || scenesRes.data);
        if (!isPreview && Array.isArray(sceneData) && sceneData.length > 0) {
          offlineContent.saveScenes(lessonId, sceneData).catch(() => {});
        } else if (!isPreview) {
          const cachedScenes: any = await offlineContent.loadScenes(lessonId).catch(() => null);
          if (Array.isArray(cachedScenes) && cachedScenes.length > 0) sceneData = cachedScenes;
        }
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
        // E6: Initialize boss mode from URL
        if (urlBossMode === 'raid' && urlRaidId) {
          setBossMode(true);
          setRaidId(urlRaidId);
        }
  }, [lessonId, initialConfig]);

  // Review mixing: fetch failed items for this lesson and merge into quiz questions
  useEffect(() => {
    if (!lessonId || !config || isPreview || lessonId.startsWith('revision-')) return;
    // Only mix into quiz-style templates
    const quizTemplates = ['quiz', 'tap-recognition', 'matching', 'fill-in-blank'];
    if (!quizTemplates.includes(config.template)) return;

    apiClient.get(ENDPOINTS.REVISION.FAILED_ITEMS, {
      params: { lesson_id: lessonId, limit: 2 },
    }).then((res) => {
      const failedItems = res.data?.data || [];
      if (failedItems.length === 0) return;

      // Convert failed items to quiz-format questions
      const reviewQs = failedItems.map((item: any) => ({
        id: `review-${item.question_id}`,
        prompt: item.question_text || 'Review: What was the correct answer?',
        options: [
          { id: item.correct_answer, label: item.correct_answer },
          ...(item.given_answer && item.given_answer !== item.correct_answer
            ? [{ id: item.given_answer, label: item.given_answer }]
            : []),
        ].filter((o) => o.label),
        correctIndex: 0,
        isReview: true,
        question_id: item.question_id,
        lesson_id: lessonId,
      }));

      // Filter to valid questions (need at least 2 options)
      const valid = reviewQs.filter((q: any) => q.options.length >= 2);
      if (valid.length === 0) return;

      // Merge: insert review questions at random positions
      const currentQuestions = config.questions || [];
      const merged = [...currentQuestions];
      for (const rq of valid) {
        const insertAt = Math.min(
          Math.floor(Math.random() * (merged.length + 1)),
          merged.length,
        );
        merged.splice(insertAt, 0, rq);
        reviewQuestionIds.current.add(rq.id);
      }
      setMergedQuestions(merged);
      // Check if first question is a review
      if (merged.length > 0 && (merged[0] as any).isReview) {
      }
    }).catch(() => {}); // silently ignore
  }, [lessonId, config]);

  // After loading, if there are scenes, show intro first — UNLESS mode was pre-selected from URL or saved
  const introShown = useRef(false);
  useEffect(() => {
    if (!loading && config && scenes.length > 0 && !introShown.current) {
      // If mode was pre-selected (URL param or localStorage), skip intro → go straight to play
      // (unless previewing — reviewer should always see the story).
      if ((validUrlMode || savedMode) && !isPreview) {
        introShown.current = true;
        setPhase('play');
        setTimerRunning(mode === 'test');
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
    if (!lessonId || !admissionNo || isPreview) return;
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

  // Adaptive difficulty: fetch the ADE v2 (BKT) profile on mount. v1 removed
  // (Phase 4 cleanup) — v2 tracks per-lesson mastery via the same lesson_id.
  useEffect(() => {
    if (!lessonId || !admissionNo || isPreview || adaptiveFetched.current) return;
    adaptiveFetched.current = true;
    apiClient.get(ENDPOINTS.ADE_V2.PROFILE(lessonId))
      .then((res) => {
        const profile = res.data?.data;
        if (profile?.difficulty) {
          setAdaptiveProfile({
            difficulty: profile.difficulty,
            mastery_pct: Math.round((profile.mastery_probability || 0) * 100),
            streak_days: profile.streak_days || 0,
          });
        }
      })
      .catch(() => {}); // No profile yet — use defaults
  }, [lessonId, admissionNo]);

  // ── Natural progression: suggest learning mode for newly unlocked units ──
  const suggestedModeApplied = useRef(false);
  useEffect(() => {
    if (!lessonId || !admissionNo || isPreview || suggestedModeApplied.current || loading) return;
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
    // E6: Boss mode combo tracking
    if (bossMode) {
      if (result.correct) {
        const { combo, justRaged, damageMultiplier } = comboCorrect(comboRef.current);
        comboRef.current = combo;
        setComboCount(combo.current);
        if (justRaged) {
          setRageActive(true);
          playRageActive();
        } else if (soundOn && combo.current >= 2) {
          playCombo(getComboFireLevel(combo.current));
        }
      } else {
        const { combo } = comboIncorrect(comboRef.current);
        comboRef.current = combo;
        setComboCount(0);
        setRageActive(false);
        if (soundOn) playComboBreak();
      }
    }
    setAnswers((prev) => [...prev, result]);

    // Review mixing: track correct/wrong answers for review questions
    if (result.question_id && lessonId) {
      if (result.is_review && result.correct) {
        // Review question answered correctly → mark as improving
        apiClient.post(ENDPOINTS.REVISION.RETRY_CORRECT, {
          lesson_id: result.lesson_id || lessonId,
          question_id: result.question_id,
        }).catch(() => {});
      } else if (!result.correct && result.question_id) {
        // Wrong answer → record as failed item
        apiClient.post(ENDPOINTS.REVISION.RECORD_FAILED, {
          lesson_id: result.lesson_id || lessonId,
          question_id: result.question_id,
          question_text: result.expected,
          given_answer: result.given,
          correct_answer: result.expected,
        }).catch(() => {});
      }
    }
  }, [lessonId]);

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
      if (isPreview) return; // preview: never record child progress
      setSubmitting(true);
      try {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
        let admissionNo = '';
        try {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
          admissionNo = decoded.admission_no || decoded.id || '';
        } catch {}
        const stars = finalScore >= 20 ? 3 : finalScore >= 10 ? 2 : 1;
        // XP = score × mode multiplier (learning gets less XP since no effort)
        const modeMultiplier = mode === 'learning' ? 0.5 : mode === 'test' ? 1.5 : 1;
        const xp = Math.round(finalScore * modeMultiplier);
        const payload = {
          child_admission_no: admissionNo,
          lesson_id: lessonId,
          score: finalScore,
          stars_earned: stars,
          xp,
          mode,
          answers_count: answers.length,
          difficulty: config?.template === 'puzzle-split' ? puzzleDifficulty : undefined,
        };
        try {
          await apiClient.post(ENDPOINTS.PROGRESS.GAME_COMPLETE, payload);
        } catch (err: any) {
          // Queue for retry when back online instead of silently dropping
          const queued = await offlineSync.enqueue({
            endpoint: ENDPOINTS.PROGRESS.GAME_COMPLETE,
            method: 'POST',
            body: payload,
          });
          if (queued) {
            console.log('[offline] Progress queued for sync:', lessonId);
          } else {
            console.warn('[offline] Progress lost — sync queue full');
          }
        }

        // Q1 NGEd — ADE v2 (BKT) update + engagement economy earn. Best-effort,
        // fire-and-forget; both are non-blocking and must never interrupt play.
        if (admissionNo && mode !== 'learning') {
          const correctCount = answers.filter((a) => a.correct).length;
          try {
            await apiClient.post(ENDPOINTS.ADE_V2.UPDATE, {
              item_id: lessonId,
              skill_key: lessonId || 'general',
              correct: correctCount > answers.length / 2,
              response_time_ms: answers.reduce((s, a) => s + (a.response_time_ms || 0), 0) || undefined,
            });
          } catch { /* best-effort */ }

          try {
            await apiClient.post(ENDPOINTS.ECONOMY.EARN, {
              action: 'game_complete',
              context: { score: finalScore, lesson_id: lessonId },
            });
          } catch { /* best-effort */ }

          // Q1 Phase 2: SRE v2 grading loop — a review-sourced practice session
          // grades its SM-2+ card on completion (quality 0-5 from accuracy; <3 = fail).
          if (isReviewSession && reviewItemId && mode === 'practice') {
            const quality = qualityForAnswers(answers);
            try {
              await apiClient.post(ENDPOINTS.REVIEWS_V2.COMPLETE, {
                skill_key: reviewSkillKey || undefined,
                item_id: reviewItemId,
                quality,
              });
            } catch { /* best-effort */ }
          }

          // Q1 Phase 2: ADE v2 next-item — recommend the child's weakest skills
          // for the result screen (skip the lesson just played). Best-effort.
          try {
            const nextRes = await apiClient.get(ENDPOINTS.ADE_V2.NEXT_ITEM(undefined, 3));
            const items: any[] = nextRes.data?.data?.items || [];
            const recs = pickNextRecs(items, lessonId);
            setNextRecs(recs.length > 0 ? recs : null);
          } catch { setNextRecs(null); }
        }
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
          setRetryMessage(res.data?.data?.message || t('game.practice_mode'));
          setPhase('retry-practice');
          return;
        }
        if (routing === 'teacher_flag') {
          setRetryMessage(t('game.teacher_help'));
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
    setTimerRunning(selectedMode === 'test');
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
    setTimerRunning(mode === 'test');
  };

  // Track scene advance from click handler (so useEffect knows not to double-speak)
  const introAdvancedByClick = useRef(false);

  // Advance intro — speak current scene DURING the click gesture, then advance
  const advanceIntro = async () => {
    if (soundOn) playTap();
    // Speak the CURRENT scene text within the click gesture (gesture context is active here)
    if (soundOn) {
      const wrapper = scenes[sceneIdx];
      if (wrapper?.scenes) {
        const texts = wrapper.scenes.map((s) => s.text).join('. ');
        introAdvancedByClick.current = true;
        setSceneSpeaking(true);
        await speakScene(texts);
        setSceneSpeaking(false);
      }
    }
    if (sceneIdx + 1 < scenes.length) {
      setSceneIdx((i) => i + 1);
    } else {
      setPhase('play');
      setTimerKey((k) => k + 1);
      setTimerRunning(mode === 'test');
    }
  };

  // Restart — go back to play phase
  const handleRestart = () => {
    setPhase('play');
    setScore(0);
    setAnswers([]);
    setTimerKey((k) => k + 1);
    setTimerRunning(mode === 'test');
  };

  // Auto-speak intro scenes — only on initial mount (sceneIdx=0) or scene change from useEffect.
  // If scene was advanced by click handler, it already spoke — skip to avoid double-speak.
  useEffect(() => {
    if (phase !== 'intro' || !soundOn) return;
    if (v2Active) return; // visual cards speak through their own effect
    if (introAdvancedByClick.current) {
      introAdvancedByClick.current = false; // consumed
      return;
    }
    const wrapper = scenes[sceneIdx];
    if (wrapper?.scenes) {
      const texts = wrapper.scenes.map((s) => s.text).join('. ');
      setSceneSpeaking(true);
      speakScene(texts).finally(() => setSceneSpeaking(false));
    }
  }, [phase, sceneIdx, scenes, soundOn, v2Active]);

  // V2 story: narrate the current card (narrationAudio else TTS).
  useEffect(() => {
    if (!v2Active || !currentCard || !soundOn) return;
    if (introAdvancedByClick.current) {
      introAdvancedByClick.current = false;
      return;
    }
    let cancelled = false;
    const run = async () => {
      setSceneSpeaking(true);
      const card = currentCard;
      if (card.narrationAudio) {
        await speakOrPlay(card.narrationAudio, card.text || '');
      } else if (card.text) {
        await speakScene(card.text);
      }
      if (!cancelled) setSceneSpeaking(false);
    };
    run();
    return () => { cancelled = true; };
  }, [v2Active, sceneIdx, currentCard, soundOn]);

  // V2 story: auto-advance after the card's duration (tap pauses/resumes via
  // the card's tap-to-advance; checkpoint + last cards wait for the button).
  useEffect(() => {
    if (!v2Active || !currentCard) return;
    if (currentCard.type === 'game_checkpoint') return;
    if (sceneIdx + 1 >= storyCards.length) return;
    const ms = estimateDurationSec(currentCard) * 1000;
    const timer = setTimeout(storyNext, ms);
    return () => clearTimeout(timer);
  }, [v2Active, sceneIdx, currentCard, storyCards.length, storyNext]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6]">
        <div className="text-center animate-game-spring-in">
          <div className="relative mx-auto mb-4 h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-[#0F4D92]/10 animate-game-pulse" />
            <Loader2 className="relative mx-auto h-16 w-16 animate-spin text-[#0F4D92]" />
          </div>
          <p className="text-sm font-medium text-gray-600 animate-game-bob">{t('game.loadingGame')}</p>
          <div className="mt-3 flex justify-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/30 animate-game-pulse stagger-1" />
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/50 animate-game-pulse stagger-2" />
            <div className="h-2 w-2 rounded-full bg-[#0F4D92]/70 animate-game-pulse stagger-3" />
          </div>
        </div>
      </div>
    );
  }  /* ── Error ── */
  if (error || !config) {
    // Freemium: free games used up → friendly locked screen.
    // IMPORTANT: children NEVER see payments — no checkout buttons here.
    // Flagship kids get "ask your parent"; locked-school kids get "tell an
    // adult". Parents/admins do the subscribing (ParentDashboard, login wall).
    if (gate?.locked) {
      const isSchoolLock = !!gate.childFriendly;
      const isDailyPlayed = gate.dailyLessonId === lessonId && gate.dailyPlayed;
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6] p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg animate-game-spring-in">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-3xl shadow-lg">
              {isSchoolLock ? '🔒' : isDailyPlayed ? '🌙' : '🔒'}
            </div>
            <h2 className="mb-2 text-lg font-extrabold text-gray-800">
              {isSchoolLock ? t('freemium.schoolEndedTitle') : isDailyPlayed ? t('freemium.dailyDoneTitle') : t('freemium.lockedTitle')}
            </h2>
            <p className="mb-6 text-sm text-gray-500">{gate.message || t('freemium.lockedBody')}</p>
            {isSchoolLock ? (
              <p className="rounded-xl bg-teal-50 border border-teal-200 p-3 mb-5 text-xs font-medium text-teal-700">
                {t('freemium.schoolEndedBody')}
              </p>
            ) : (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-5">
                <p className="text-xs font-medium text-amber-700">
                  {t('freemium.quotaInfo', { freeLimit: gate.freeLimit })}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  {t('freemium.askParent')}
                </p>
              </div>
            )}
            <button onClick={() => navigate('/student')} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition-all">
              {t('game.backToGames')}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6]">
        <div className="text-center animate-game-spring-in">
          <Gamepad2 className="mx-auto mb-3 h-12 w-12 text-gray-300 animate-game-wobble-idle" />
          <p className="font-semibold text-gray-700 animate-game-slide-up stagger-1">{error || t('game.notFound')}</p>
          <button onClick={() => navigate('/student')} className="mt-4 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-medium text-white hover:bg-[#0D3F7A] transition-all hover:scale-105 hover:animate-game-squish active:scale-95 animate-game-slide-up stagger-2">
            {t('game.backToGames')}
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
    const v2Mode = v2Active;
    const card = v2Mode ? currentCard : null;

    /* Illustrated v2 story pager — one visual card per page */
    if (v2Mode && card) {
      const isCheckpoint = card.type === 'game_checkpoint';
      const isFinal = sceneIdx + 1 >= storyCards.length;
      const checkpointNote = isCheckpoint
        ? card.gameId && card.gameId !== lessonId
          ? t('game.story.checkpointOther')
          : t('game.story.checkpointNow')
        : '';
      return (
        <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#E7EEF6] to-white overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 animate-game-slide-down">
            <button onClick={() => navigate('/student')} className="rounded-lg p-1.5 hover:bg-white/50 transition-all hover:scale-110 active:scale-95">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-gray-600">{t('game.storyTime')} 📖</h1>
              <span className="rounded-full bg-[#0F4D92]/10 px-2 py-0.5 text-[10px] font-bold text-[#0F4D92]">
                {sceneIdx + 1}/{storyCards.length}
              </span>
            </div>
            <button onClick={() => setSoundOn(!soundOn)} className="rounded-lg p-1.5 hover:bg-white/50 transition-all hover:scale-110 active:scale-95">
              {soundOn ? <Volume2 className="h-5 w-5 text-[#0F4D92]" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
            </button>
          </header>

          <div className="flex flex-1 flex-col items-center justify-center px-4 py-4">
            <div className="w-full max-w-md">
              <SceneRenderer
                scene={card}
                library={sceneLibrary}
                index={sceneIdx}
                total={storyCards.length}
                speaking={sceneSpeaking}
                checkpointNote={checkpointNote}
                onAdvance={() => {
                  if (!isCheckpoint && soundOn) playTap();
                  if (!isCheckpoint) storyNext();
                }}
              />

              {/* Checkpoint action — start the embedded game */}
              {isCheckpoint && (
                <button
                  onClick={() => {
                    if (soundOn) playTap();
                    launchCheckpoint(card);
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Gamepad2 className="h-6 w-6" /> {t('game.letsPlay')} 🎮
                </button>
              )}

              {/* Non-checkpoint footer */}
              {!isCheckpoint && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    onClick={() => { if (soundOn) playTap(); storyNext(); }}
                    className={`rounded-xl px-8 py-3 text-base font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95 ${
                      isFinal
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                        : 'bg-[#0F4D92] hover:bg-[#0D3F7A]'
                    }`}
                  >
                    {isFinal ? (
                      <span className="flex items-center gap-2">
                        <Gamepad2 className="h-5 w-5" /> {t('game.letsPlay')} 🎮
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        {t('common.next')} <span className="animate-game-bounce inline-block">→</span>
                      </span>
                    )}
                  </button>
                  <button onClick={handleSkipIntro} className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors">
                    {t('game.skipStory')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#E7EEF6] to-white overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 animate-game-slide-down">
          <button onClick={() => navigate('/student')} className="rounded-lg p-1.5 hover:bg-white/50 transition-all hover:scale-110 active:scale-95">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-600">{t('game.storyTime')} 📖</h1>
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
          <p className="text-center text-[10px] text-gray-400 mb-1.5">{t('game.tapModeStart')}</p>
          <div className="mx-auto flex max-w-md gap-1 rounded-xl bg-white p-1 shadow-sm">
            {([
              { key: 'learning' as GameMode, icon: '📺', label: t('game.modeLabel.learn'), color: 'purple' },
              { key: 'practice' as GameMode, icon: '🎯', label: t('game.modeLabel.practice'), color: 'green' },
              { key: 'test' as GameMode, icon: '📝', label: t('game.modeLabel.test'), color: 'blue' },
            ]).map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  playTap();
                  handleModeSelect(m.key);
                  // Start playing immediately — skip intro
                  setPhase('play');
                  setTimerKey((k) => k + 1);
                  setTimerRunning(m.key === 'test');
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
              <span className="font-medium">{t('game.speaking')}</span>
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
                  <Gamepad2 className="h-5 w-5" /> {t('game.letsPlay')} 🎮
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
              {t('game.skipStory')}
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
          <h1 className="mb-2 text-2xl font-bold text-gray-800">{t('game.letsPractice')}</h1>
          <p className="mb-6 text-sm text-gray-500">{retryMessage}</p>
          <div className="mb-6 rounded-2xl bg-white p-5 shadow-md">
            <p className="text-sm text-gray-600">
              {t('game.practiceEncouragement')}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { playTap(); handleModeSelect('practice'); setPhase('play'); }}
              className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-green-600 transition-all hover:scale-105 active:scale-95"
            >
              🎯 {t('game.goToPractice')}
            </button>
            <button
              onClick={() => { playTap(); navigate('/student'); }}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
            >
              {t('game.backToGames')}
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
      <>
        <ResultBreakdown
          answers={answers}
          score={score}
          totalPossible={totalPossible}
          mode={mode}
          onRestart={handleRestart}
          onBack={() => navigate('/student')}
        />
        {/* Q1 Phase 2: ADE v2 next-item recommendations (weakest skills first) */}
        {nextRecs && nextRecs.length > 0 && (
          <div className="w-full bg-[#E7EEF6] px-6 pb-10 -mt-10">
            <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-4 shadow-md animate-game-slide-up">
              <h3 className="mb-3 text-sm font-bold text-[#0F4D92]">{t('game.playNext')}</h3>
              <div className="space-y-2">
                {nextRecs.map((rec) => (
                  <button
                    key={rec.lesson_id || rec.skill_key}
                    onClick={() => {
                      playTap();
                      if (rec.lesson_id) navigate(`/play/${encodeURIComponent(rec.lesson_id)}${isPreview ? '?preview=1' : ''}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-left transition-all hover:bg-blue-100/80 active:scale-[0.98]"
                  >
                    <span className="text-xl">{reasonEmoji(rec.reason)}</span>
                    <span className="flex-1 text-sm font-semibold text-gray-700 capitalize">
                      {humanizeSkill(rec.skill_key)}
                    </span>
                    <span className="text-xs font-bold text-[#0F4D92]">{t('game.playNextButton')} →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ── Play Phase ── */
  return (
    <div className="flex min-h-screen flex-col bg-[#E7EEF6]">
      {/* Preview mode banner (teacher/admin play-test before submit/approval) */}
      {isPreview && (
        <div className="flex items-center justify-between gap-2 bg-indigo-600 px-3 py-2 text-white text-xs sm:text-sm font-semibold">
          <span className="flex items-center gap-2">👁️ {t('game.previewMode')}</span>
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/teacher/lessons'))}
            className="rounded-lg bg-white/20 px-3 py-1 hover:bg-white/30 active:scale-95"
          >
            {t('game.backToTeacher')}
          </button>
        </div>
      )}
      {/* E2: offline progress banner (shows queue state while offline) */}
      <OfflineBanner hasQueuedProgress={queuedCount > 0} pending={queuedCount} />
      <header className="flex items-center gap-1.5 border-b border-white/50 bg-white/80 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5 backdrop-blur">
        <button onClick={() => (isPreview ? (window.history.length > 1 ? navigate(-1) : navigate('/teacher/lessons')) : navigate('/student'))} className="rounded-lg p-2 sm:p-1.5 hover:bg-gray-100 active:scale-95">
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
                ? t('game.lockedClass', { mode: modeLock?.locked_mode || '' })
                : t('game.lockedStudent', { mode: modeLock?.locked_mode || '' })
              : isTeacher
                ? t('game.lockClass', { mode })
                : t('game.lockMode', { mode })}
          >
            {isModeLocked ? '🔒' : '🔓'}
            {canLockMode && isTeacher && <span className="ml-0.5 text-[9px]">{t('game.classLabel')}</span>}
          </button>
        )}
        {isModeLocked && !canLockMode && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 font-medium" title={t('game.lockedBy', { role: modeLock?.locked_by_role || '', scope: modeLock?.class_code ? t('game.lockScopeClass') : t('game.lockScopeStudent') })}>🔒</span>
        )}
        <button
          onClick={toggleColorblind}
          className={`rounded-lg p-2 sm:p-1.5 transition-all active:scale-95 ${colorblindMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}`}
          title={colorblindMode ? t('game.colorblindOn') : t('game.colorblindOff')}
          aria-label={t('game.toggleColorblind')}
        >
          <Palette className="h-5 w-5" />
        </button>
        <button onClick={() => setSoundOn(!soundOn)} className="rounded-lg p-2 sm:p-1.5 hover:bg-gray-100 active:scale-95">
          {soundOn ? <Volume2 className="h-5 w-5 text-[#0F4D92]" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
        </button>
        <SpeechSettings />
        {adaptiveProfile && (
          <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] sm:text-xs font-bold text-blue-600" title={`Difficulty: ${adaptiveProfile.difficulty}/5 | Mastery: ${adaptiveProfile.mastery_pct}% | Streak: ${adaptiveProfile.streak_days}d`}>
            L{adaptiveProfile.difficulty}
          </span>
        )}
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
            { key: 'learning' as GameMode, icon: '📺', label: t('game.modeLabel.learn'), color: 'purple', desc: t('game.modeDesc.learn') },
            { key: 'practice' as GameMode, icon: '🎯', label: t('game.modeLabel.practice'), color: 'green', desc: t('game.modeDesc.practice') },
            { key: 'test' as GameMode, icon: '📝', label: t('game.modeLabel.test'), color: 'blue', desc: t('game.modeDesc.test') },
          ]).map((m) => (
            <button
              key={m.key}
              onClick={() => handleModeSelect(m.key)}
              disabled={isModeLocked}
              title={isModeLocked ? t('game.lockedByDetails', { role: modeLock?.locked_by_role || '', name: modeLock?.locked_by_name || '' }) : m.desc}
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

      {/* Timer bar — test mode only */}
      {mode === 'test' && (
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
            <p className="text-sm font-bold text-amber-800">{t('game.greatJobToday')}</p>
            <p className="text-xs text-amber-600">{t('game.breakHint')}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { playTap(); navigate('/student'); }}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition-all"
            >
              {t('game.rest')} 🌙
            </button>
            <button
              onClick={() => { playTap(); setBreakDismissed(true); setShowBreakSuggestion(false); }}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-100 transition-all"
            >
              {t('game.keepPlaying')}
            </button>
          </div>
        </div>
      )}

      {/* Sticker button — floating emoji celebration overlay */}
      {mode !== 'learning' && (
        <StickerButton
          onSelect={(emoji) => {
            // Send sticker as celebration — could integrate with chat/feedback in future
            if (soundOn) playCelebration();
          }}
          position="bottom-right"
          size="md"
        />
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
            <QuizGame
              config={mergedQuestions ? { ...config, questions: mergedQuestions } : config}
              onComplete={handleGameComplete}
              soundOn={soundOn}
              mode={mode}
              onAnswer={handleAnswer}
            />
          )}
          {config.template === 'memory-pairs' && (
            <MemoryPairsGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'fill-in-blank' && (
            <FillBlankGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'puzzle-split' && (
            <PuzzleGame config={config} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} onDifficultyChange={setPuzzleDifficulty} />
          )}
          {config.template === 'label-diagram' && (
            <LabelDiagramGame config={config as any} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'stage-sequence' && (
            <StageSequenceGame config={config as any} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
          {config.template === 'game-chain' && (
            <GameChainGame config={config as any} onComplete={handleGameComplete} soundOn={soundOn} mode={mode} onAnswer={handleAnswer} />
          )}
        </div>
      </div>
    </div>
  );
}
