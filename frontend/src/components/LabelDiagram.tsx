/**
 * LabelDiagram — "tap the part of a real diagram" game + embedded check.
 *
 * A real diagram image (face, body, tree, car, plant) carries hotspot hit
 * zones positioned by PERCENT of the image bounds (schema: x/y as % of
 * width/height, r as % of width). Rounds ladder simple → complex — the author
 * lists big obvious parts first, smaller parts later — and are never shuffled.
 *
 * Modes:
 *   label-to-part  — a part name is spoken/shown, child taps it on the diagram
 *   part-to-label  — a part is cued on the diagram, child taps its name chip
 *   mixed          — alternate both across the rounds
 *
 * Exported pieces:
 *   hitTestHotspot()      — pure %-space hit test (unit-tested in vitest)
 *   buildPartRounds()     — pure round builder (label-to-part / part-to-label)
 *   LabelDiagramGame      — full game component used by GamePlay
 *   TapPartCheck          — single embedded "tap the part" challenge, reused by
 *                           StageSequence label-diagram checks (one hotspot
 *                           target, no round bookkeeping)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CachedImg from '@/components/CachedImg';
import SpeakButton from '@/components/SpeakButton';
import { t } from '@/lib/i18n';
import { speak, playCorrect, playWrong, playTap, playHint } from '@/lib/utils/sound';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { getFeedbackClasses } from '@/lib/utils/accessibility';
// Pure logic (unit-tested in lib/game) — no component/browser deps.
import { buildPartRounds, buildLabelOptions } from '@/lib/game/labelDiagram';
import type { Hotspot, DiagramMode } from '@/lib/game/labelDiagram';

export type { Hotspot } from '@/lib/game/labelDiagram';

/* ── Component types ─────────────────────────────────────── */

export type GameMode = 'practice' | 'test' | 'learning';

export interface LabelDiagramConfig {
  template: string;
  lessonId?: string;
  diagram?: { image?: string; alt?: string; background?: string };
  hotspots?: Hotspot[];
  labelBank?: string[];
  mode?: DiagramMode;
  rounds?: number;
  scenario?: string;
  hint?: string;
  speechText?: string;
  feedbackCorrect?: string;
  feedbackWrong?: string;
  ageLevel?: string;
  characters?: { name: string; emoji?: string; image?: string }[];
}

/* ── Tiny presentational atoms ───────────────────────────── */

function DiagramCanvas({
  diagram,
  hotspots,
  children,
  className = '',
}: {
  diagram: { image?: string; alt?: string; background?: string };
  hotspots: Hotspot[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative w-full select-none ${className}`}>
      {diagram.image ? (
        <CachedImg
          src={diagram.image}
          alt={diagram.alt || 'diagram'}
          className="w-full rounded-2xl border border-gray-200 object-contain"
          draggable={false}
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-center">
          <span className="text-sm text-gray-400">{t('game.labelDiagram.noDiagram')}</span>
        </div>
      )}
      {/* Hit zones — absolutely positioned at hotspot centre (percent coords). */}
      {children}
      {hotspots.length === 0 && diagram.image && (
        <p className="mt-2 text-center text-xs text-gray-400">{t('game.labelDiagram.noHotspots')}</p>
      )}
    </div>
  );
}

/** One circular tap zone centred at (x%, y%) with width 2r% of the diagram. */
function HotspotZone({
  spot,
  state,
  disabled,
  onTap,
}: {
  spot: Hotspot;
  state?: 'idle' | 'correct' | 'wrong' | 'cue';
  disabled?: boolean;
  onTap?: (spot: Hotspot) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cb = getFeedbackClasses(colorblindMode, state === 'correct' ? 'correct' : 'wrong');
  const ring =
    state === 'correct'
      ? `ring-4 ${cb.border} bg-green-100/60`
      : state === 'wrong'
      ? `ring-4 ${cb.border} bg-red-100/60 animate-game-wrong`
      : state === 'cue'
      ? 'ring-4 ring-blue-300 bg-blue-100/50 animate-game-glow-pulse'
      : 'ring-0 bg-transparent';
  return (
    <button
      type="button"
      aria-label={spot.label}
      title={spot.label}
      disabled={disabled}
      onClick={() => onTap?.(spot)}
      style={{
        left: `${spot.x}%`,
        top: `${spot.y}%`,
        width: `${Math.max(spot.r * 2, 6)}%`,
      }}
      className={`absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200 ${ring} ${
        state === 'idle' || !state ? '' : 'shadow-md'
      } ${state === 'idle' || !state ? 'hover:bg-[#0F4D92]/10' : ''} focus:outline-none`}
    />
  );
}

/* ── Embedded single "tap the part" check (StageSequence) ── */

interface TapPartCheckProps {
  prompt?: string;
  diagram?: { image?: string; alt?: string; background?: string };
  hotspots?: Hotspot[];
  correctId?: string;
  /** Called when the round resolves. Practice: on the correct tap; test: first tap. */
  onSettled: (result: { correct: boolean; expected: string; given: string }) => void;
  soundOn: boolean;
  isTest: boolean;
  autoDemo?: boolean;
  className?: string;
}

/**
 * One-shot embedded label-diagram challenge. Used by StageSequence closing
 * assessments (kind = label-diagram, e.g. plant growth sequence ends with
 * "tap the flower on the grown plant"). Reuses the same hotspot hit-testing
 * as the full game — no duplicated logic.
 */
export function TapPartCheck({
  prompt,
  diagram = {},
  hotspots = [],
  correctId,
  onSettled,
  soundOn,
  isTest,
  autoDemo = false,
  className = '',
}: TapPartCheckProps) {
  const correct = useMemo(() => hotspots.find((h) => h.id === correctId) || null, [hotspots, correctId]);
  const [states, setStates] = useState<Record<string, 'correct' | 'wrong' | 'cue' | 'idle'>>({});
  const [settled, setSettled] = useState(false);
  const spokenRef = useRef(false);

  const demoRef = useRef(false);
  useEffect(() => {
    if (!autoDemo || demoRef.current || !correct) return;
    demoRef.current = true;
    const timers = [
      setTimeout(() => setStates({ [correct.id]: 'cue' }), 400),
      setTimeout(() => {
        setStates({ [correct.id]: 'correct' });
        onSettled({ correct: true, expected: correct.label, given: correct.label });
      }, 1600),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo, correct]);

  useEffect(() => {
    if (!soundOn || spokenRef.current) return;
    spokenRef.current = true;
    const text = prompt || (correct ? t('game.labelDiagram.tapThePart', { part: correct.label }) : '');
    const timer = setTimeout(() => speak(text).catch(() => {}), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, correct, soundOn]);

  const handleTap = (spot: Hotspot) => {
    if (settled || !correct) return;
    const isCorrect = spot.id === correct.id;
    if (isTest) {
      // Test: first tap settles the round.
      setSettled(true);
      const next: Record<string, 'correct' | 'wrong' | 'idle'> = {};
      hotspots.forEach((h) => {
        next[h.id] = h.id === correct.id ? 'correct' : h.id === spot.id ? 'wrong' : 'idle';
      });
      setStates(next);
      if (soundOn) (isCorrect ? playCorrect : playWrong)();
      onSettled({ correct: isCorrect, expected: correct.label, given: spot.label });
      return;
    }
    if (!isCorrect) {
      if (soundOn) playHint();
      setStates({ [spot.id]: 'wrong' });
      setTimeout(() => setStates({}), 700);
      return;
    }
    setSettled(true);
    setStates({ [correct.id]: 'correct' });
    if (soundOn) playCorrect();
    onSettled({ correct: true, expected: correct.label, given: spot.label });
  };

  if (!correct || hotspots.length === 0) {
    // No resolvable target — never block a lesson on a broken config.
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
        <p className="text-sm font-medium text-amber-800">{prompt || t('game.labelDiagram.noHotspots')}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="mb-3 text-center text-lg font-semibold text-gray-800">
        {prompt || t('game.labelDiagram.tapThePart', { part: correct.label })}
        <SpeakButton
          text={prompt || t('game.labelDiagram.tapThePart', { part: correct.label })}
          size="sm"
          className="ml-2 align-middle"
        />
      </p>
      <DiagramCanvas diagram={diagram} hotspots={hotspots}>
        {hotspots.map((h) => (
          <HotspotZone
            key={h.id}
            spot={h}
            state={(states[h.id] as 'correct' | 'wrong') || (settled && h.id !== correct.id ? 'idle' : undefined)}
            disabled={settled}
            onTap={handleTap}
          />
        ))}
      </DiagramCanvas>
    </div>
  );
}

/* ── Full game (GamePlay) ────────────────────────────────── */

interface GameProps {
  config: LabelDiagramConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: { correct: boolean; expected: string; given: string; question_id?: string; lesson_id?: string }) => void;
}

export default function LabelDiagramGame({ config, onComplete, soundOn, mode, onAnswer }: GameProps) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const isTest = mode === 'test';
  const isLearning = mode === 'learning';

  const hotspots = useMemo(() => config.hotspots || [], [config]);
  const rounds = useMemo(() => buildPartRounds(hotspots, config.mode, config.rounds), [hotspots, config.mode, config.rounds]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [states, setStates] = useState<Record<string, 'correct' | 'wrong' | 'cue' | 'idle'>>({});
  const [chosenLabel, setChosenLabel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [locked, setLocked] = useState(false);
  const scoreRef = useRef(0);
  const round = rounds[roundIdx];
  const roundTotal = Math.max(rounds.length, hotspots.length > 0 ? hotspots.length : 0);

  // Learning demo: cue + speak every round automatically.
  const learningStepRef = useRef(0);
  useEffect(() => {
    if (!isLearning || !round) return;
    const step = learningStepRef.current;
    learningStepRef.current += 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setStates({ [round.hotspot.id]: 'cue' });
        if (soundOn && round.mode === 'label-to-part') speak(round.hotspot.label).catch(() => {});
      }, 600 + step * 0),
    );
    timers.push(
      setTimeout(() => {
        setStates({ [round.hotspot.id]: 'correct' });
        if (roundIdx + 1 >= rounds.length) onComplete(scoreRef.current);
        else setRoundIdx((i) => i + 1);
      }, 2000),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLearning, roundIdx]);

  const showFeedback = useCallback(
    (type: 'correct' | 'wrong') => {
      if (isTest) return;
      const msg =
        type === 'correct'
          ? config.feedbackCorrect || t('game.feedback.perfect')
          : config.feedbackWrong || t('game.feedback.notQuite');
      setFeedback(type);
      setFeedbackMsg(msg);
      setTimeout(() => {
        setFeedback(null);
        setFeedbackMsg('');
      }, type === 'correct' ? 1000 : 1600);
    },
    [config, isTest],
  );

  const advance = useCallback(() => {
    setStates({});
    setChosenLabel(null);
    setLocked(false);
    if (roundIdx + 1 >= rounds.length) onComplete(scoreRef.current);
    else setRoundIdx((i) => i + 1);
  }, [roundIdx, rounds.length, onComplete]);

  // TTS the intro/speech once per game (test + practice).
  const introSpoken = useRef(false);
  useEffect(() => {
    if (isLearning || introSpoken.current || !soundOn) return;
    introSpoken.current = true;
    const text = config.speechText || (rounds[0] ? `Tap the ${rounds[0].hotspot.label}` : '');
    const timer = setTimeout(() => speak(text).catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Label-to-part round: tap the named hotspot.
  const handleZoneTap = (spot: Hotspot) => {
    if (locked || !round || round.mode !== 'label-to-part') return;
    const correctSpot = round.hotspot;
    const isCorrect = spot.id === correctSpot.id;
    if (!isTest && soundOn) playTap();
    if (isTest) {
      setLocked(true);
      const next: Record<string, 'correct' | 'wrong' | 'idle'> = {};
      hotspots.forEach((h) => {
        next[h.id] = h.id === correctSpot.id ? 'correct' : h.id === spot.id ? 'wrong' : 'idle';
      });
      setStates(next);
      if (soundOn) (isCorrect ? playCorrect : playWrong)();
      onAnswer?.({
        correct: isCorrect,
        expected: correctSpot.label,
        given: spot.label,
        question_id: correctSpot.id,
        lesson_id: config.lessonId,
      });
      setTimeout(advance, isCorrect ? 350 : 900);
      return;
    }
    if (!isCorrect) {
      if (soundOn) playHint();
      showFeedback('wrong');
      setStates({ [spot.id]: 'wrong' });
      setTimeout(() => setStates({}), 600);
      return;
    }
    scoreRef.current += 10;
    if (soundOn) playCorrect();
    showFeedback('correct');
    setStates({ [correctSpot.id]: 'correct' });
    onAnswer?.({
      correct: true,
      expected: correctSpot.label,
      given: spot.label,
      question_id: correctSpot.id,
      lesson_id: config.lessonId,
    });
    setTimeout(advance, 800);
  };

  // Part-to-label round: the diagram cue is shown; child taps the label chip.
  const labelOptions = useMemo(() => {
    if (!round || round.mode !== 'part-to-label') return [];
    return buildLabelOptions(hotspots, config.labelBank || [], round.hotspot.label);
  }, [round, hotspots, config.labelBank]);

  const handleLabelPick = (label: string) => {
    if (locked || !round || round.mode !== 'part-to-label') return;
    const isCorrect = label === round.hotspot.label;
    if (!isTest && soundOn) playTap();
    if (isTest) {
      setLocked(true);
      setChosenLabel(label);
      if (soundOn) (isCorrect ? playCorrect : playWrong)();
      onAnswer?.({
        correct: isCorrect,
        expected: round.hotspot.label,
        given: label,
        question_id: round.hotspot.id,
        lesson_id: config.lessonId,
      });
      setTimeout(advance, isCorrect ? 350 : 900);
      return;
    }
    if (!isCorrect) {
      if (soundOn) playHint();
      showFeedback('wrong');
      setChosenLabel(label);
      setTimeout(() => setChosenLabel(null), 700);
      return;
    }
    scoreRef.current += 10;
    if (soundOn) playCorrect();
    showFeedback('correct');
    setChosenLabel(label);
    onAnswer?.({
      correct: true,
      expected: round.hotspot.label,
      given: label,
      question_id: round.hotspot.id,
      lesson_id: config.lessonId,
    });
    setTimeout(advance, 800);
  };

  const character = config.characters?.[0] || null;

  if (hotspots.length === 0) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-800">{t('game.labelDiagram.noHotspots')}</p>
      </div>
    );
  }

  const isPartToLabel = round?.mode === 'part-to-label';
  const cueSpot = isPartToLabel ? round.hotspot : null;

  return (
    <div className="space-y-4 select-none">
      {/* Character badge */}
      {character && (
        <div className="flex items-center gap-3 animate-game-drop-in">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
            {character.image ? (
              <CachedImg src={character.image} alt={character.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl">{character.emoji || character.name[0]}</span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-800">{character.name}</p>
        </div>
      )}

      {config.scenario && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 animate-game-slide-up">
          <p className="text-sm font-medium text-blue-800">
            {config.scenario}
            <SpeakButton text={config.speechText || config.scenario} size="sm" className="ml-2 align-middle" />
          </p>
        </div>
      )}

      {/* Round meta */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#0F4D92]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F4D92]">
          {t('game.labelDiagram.round', { current: Math.min(roundIdx + 1, roundTotal || 1), total: roundTotal })}
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: roundTotal }).map((_, i) => (
            <div key={i} className={`h-2 w-2 rounded-full transition-all ${i < roundIdx ? 'bg-green-400' : i === roundIdx ? 'bg-[#0F4D92] animate-game-glow-pulse' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      {/* Prompt banner */}
      {round && (
        <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3 shadow-sm">
          {isPartToLabel ? (
            <>
              <p className="text-center text-base font-bold text-gray-800">
                {t('game.labelDiagram.chooseLabel')}
                <SpeakButton
                  text={`${t('game.labelDiagram.chooseLabel')} ${round.hotspot.label}`}
                  size="sm"
                  className="ml-2 align-middle"
                />
              </p>
              {/* Cue chip — name + emoji of the part being asked */}
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${cbCorrect.bg} ${cbCorrect.text} border ${cbCorrect.border}`}>
                  {cueSpot?.emoji ? <span className="text-base">{cueSpot.emoji}</span> : '👉'}
                  {cueSpot?.label}
                </span>
              </div>
            </>
          ) : (
            <p className="text-center text-base font-bold text-gray-800">
              {t('game.labelDiagram.tapThePart', { part: round.hotspot.label })}
              <SpeakButton text={round.hotspot.label} size="sm" className="ml-2 align-middle" />
            </p>
          )}
        </div>
      )}

      {/* Diagram with hotspots (label-to-part rounds are interactive zones) */}
      <DiagramCanvas diagram={config.diagram || {}} hotspots={hotspots}>
        {hotspots.map((h) => {
          const st = states[h.id] as 'correct' | 'wrong' | undefined;
          const isCurrentPart = !isPartToLabel && h.id === round?.hotspot?.id;
          // In part-to-label rounds the current part gets a gentle pulsing cue;
          // in label-to-part rounds the child must find it themselves.
          const cue = isPartToLabel && h.id === round?.hotspot?.id ? 'cue' : undefined;
          return (
            <HotspotZone
              key={h.id}
              spot={h}
              state={st || cue || (isCurrentPart && isLearning ? 'cue' : undefined)}
              disabled={locked || isLearning}
              onTap={handleZoneTap}
            />
          );
        })}
      </DiagramCanvas>

      {/* Part-to-label chips */}
      {isPartToLabel && (
        <div className="flex flex-wrap justify-center gap-2">
          {labelOptions.map((label) => {
            const isChosen = chosenLabel === label;
            const isRight = label === round?.hotspot.label;
            let cls = 'border-gray-200 bg-white text-gray-700 hover:border-[#0F4D92]/40 hover:bg-blue-50';
            if (isChosen && !isTest) cls = `${cbWrong.border} ${cbWrong.bg} ${cbWrong.text} animate-game-wrong`;
            if (isChosen && isRight && !isTest) cls = `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text}`;
            if (isTest && isChosen) cls = isRight ? `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text}` : `${cbWrong.border} ${cbWrong.bg} ${cbWrong.text}`;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleLabelPick(label)}
                disabled={locked || isLearning}
                className={`rounded-2xl border-2 px-5 py-3 text-base font-bold transition-all active:scale-95 disabled:opacity-70 ${cls}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {config.hint && (feedback === 'wrong') && (
        <p className="mx-auto max-w-md rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
          💡 {config.hint}
        </p>
      )}

      {feedback && feedbackMsg && (
        <p className={`animate-game-pop text-center text-sm font-bold ${feedback === 'correct' ? 'text-green-600' : 'text-amber-600'}`}>
          {feedback === 'correct' ? '🎉 ' : '🤔 '}
          {feedbackMsg}
        </p>
      )}

      {isLearning && (
        <p className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-2 text-center text-sm font-medium text-purple-600">
          📺 {t('game.mode.learning')}
        </p>
      )}
    </div>
  );
}
