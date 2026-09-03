/**
 * StageSequence — ordered simple→complex step-graphic learning.
 *
 * One template for EVERY staged progression: clock times (1:00 → 3:15 →
 * 3:45), lifecycles (human infant → child → adult → old age), plant growth
 * (seed → seedling → flower → harvest), money steps… The steps[] array IS the
 * pedagogy — renderers MUST play it in order and NEVER shuffle it.
 *
 * Flow:
 *   1. Watch phase — every step plays in order: graphic (image | analog-clock
 *      | emoji) + narration TTS + auto-advance after durationSec (tap to
 *      advance early).
 *   2. Check phase — closing assessment[] questions proving the sequence was
 *      learned, simple → complex. Kinds: text / analog-clock / image = chip
 *      choice (options + correctIndex); label-diagram = embedded TapPartCheck
 *      ("tap the flower on the grown plant") reusing LabelDiagram hit-testing.
 *
 * Order guarantee: steps and checks are iterated by array index only — no
 * shuffle, sort, or randomisation anywhere in this file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CachedImg from '@/components/CachedImg';
import SpeakButton from '@/components/SpeakButton';
import AnalogClock from '@/components/AnalogClock';
import { TapPartCheck } from '@/components/LabelDiagram';
import { t } from '@/lib/i18n';
import { speak, playCorrect, playWrong, playTap, playHint, playComplete } from '@/lib/utils/sound';
import { useA11yStore } from '@/lib/utils/a11y-store';
import { getFeedbackClasses } from '@/lib/utils/accessibility';
// Types + pure guards live in lib/game/stageSequence (unit-tested, no deps).
import {
  sanitizeChecks,
  isStepKind,
} from '@/lib/game/stageSequence';
import type {
  SequenceStep,
  SequenceCheck,
  StageSequenceConfigShape as StageSequenceConfig,
} from '@/lib/game/stageSequence';

export type GameMode = 'practice' | 'test' | 'learning';
export type { SequenceStep, SequenceCheck, StageSequenceConfig };

/** The ordered step graphic. */
function StepGraphic({ step, size = 190 }: { step: SequenceStep; size?: number }) {
  const kind = isStepKind(step.kind) ? step.kind : 'emoji';
  if (kind === 'image') {
    return step.image ? (
      <CachedImg
        src={step.image}
        alt={step.label}
        className="mx-auto max-h-64 w-auto rounded-2xl border border-gray-200 bg-white object-contain shadow-sm"
        draggable={false}
      />
    ) : (
      <span className="text-[88px] leading-none">🖼️</span>
    );
  }
  if (kind === 'analog-clock' && step.time) {
    return <AnalogClock time={step.time} size={size} className="mx-auto drop-shadow-md" />;
  }
  return <span className="text-[96px] leading-none drop-shadow-md">{step.emoji || '✨'}</span>;
}

/** Chip-choice closing check (kinds text / analog-clock / image). */
function ChipCheck({
  check,
  isTest,
  isLearning,
  soundOn,
  onSettled,
}: {
  check: SequenceCheck;
  isTest: boolean;
  isLearning: boolean;
  soundOn: boolean;
  onSettled: (r: { correct: boolean; expected: string; given: string }) => void;
}) {
  const { colorblindMode } = useA11yStore();
  const cbCorrect = getFeedbackClasses(colorblindMode, 'correct');
  const cbWrong = getFeedbackClasses(colorblindMode, 'wrong');
  const options = useMemo(() => (check.options || []).filter((o) => o && String(o).trim()), [check]);
  const correctIndex = typeof check.correctIndex === 'number' ? check.correctIndex : -1;
  const [picked, setPicked] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const spokenRef = useRef(false);

  // Auto-speak the question (test + practice). Learning demo speaks the
  // correct answer instead.
  useEffect(() => {
    if (spokenRef.current) return;
    if (isLearning) return; // demo effect speaks below
    spokenRef.current = true;
    if (!soundOn) return;
    const timer = setTimeout(() => {
      const text = check.speechText || check.prompt || '';
      speak(text).catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

  // Learning demo: highlight the correct chip then settle.
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isLearning) return;
    demoTimer.current = setTimeout(() => {
      setPicked(correctIndex >= 0 && correctIndex < options.length ? correctIndex : null);
      setTimeout(() => {
        if (soundOn) playCorrect();
        onSettled({ correct: true, expected: options[correctIndex] || '', given: options[correctIndex] || '' });
      }, 900);
    }, 1400);
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLearning]);

  if (options.length === 0 || correctIndex < 0 || correctIndex >= options.length) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
        <p className="text-sm font-medium text-amber-800">{check.prompt || t('game.stageSequence.brokenCheck')}</p>
      </div>
    );
  }

  const handlePick = (idx: number) => {
    if (settled) return;
    const isCorrect = idx === correctIndex;
    if (isTest) {
      setSettled(true);
      setPicked(idx);
      if (soundOn) (isCorrect ? playCorrect : playWrong)();
      onSettled({
        correct: isCorrect,
        expected: options[correctIndex],
        given: options[idx],
      });
      return;
    }
    if (!isCorrect) {
      if (soundOn) playHint();
      setPicked(idx);
      setTimeout(() => setPicked(null), 650);
      return;
    }
    setSettled(true);
    setPicked(idx);
    if (soundOn) playCorrect();
    onSettled({ correct: true, expected: options[correctIndex], given: options[idx] });
  };

  return (
    <div className="space-y-4">
      {/* Question + visual */}
      <div className="rounded-2xl bg-white border border-gray-200 px-4 py-4 text-center shadow-sm">
        {check.kind === 'analog-clock' && check.time && (
          <div className="mb-3 flex justify-center">
            <AnalogClock time={check.time} size={170} className="drop-shadow-md" />
          </div>
        )}
        {check.kind === 'image' && check.image && (
          <div className="mb-3 flex justify-center">
            <CachedImg src={check.image} alt="" className="max-h-44 rounded-xl border border-gray-200 object-contain" draggable={false} />
          </div>
        )}
        <p className="text-base font-bold text-gray-800">
          {check.prompt || t('game.chooseAnswer')}
          <SpeakButton
            text={check.speechText || check.prompt || ''}
            size="sm"
            className="ml-2 align-middle"
          />
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {options.map((label, idx) => {
          let cls = 'border-gray-200 bg-white text-gray-700 hover:border-[#0F4D92]/40 hover:bg-blue-50';
          const showAs = settled ? (idx === correctIndex ? 'correct' : idx === picked ? 'wrong' : null) : picked === idx ? 'wrong' : null;
          if (showAs === 'correct') cls = `${cbCorrect.border} ${cbCorrect.bg} ${cbCorrect.text} scale-105`;
          if (showAs === 'wrong') cls = `${cbWrong.border} ${cbWrong.bg} ${cbWrong.text} animate-game-wrong`;
          return (
            <button
              key={`${label}-${idx}`}
              type="button"
              onClick={() => handlePick(idx)}
              disabled={settled || isLearning}
              className={`rounded-2xl border-2 px-5 py-3 text-base font-bold transition-all active:scale-95 disabled:opacity-80 ${cls}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Game component ──────────────────────────────────────── */

interface GameProps {
  config: StageSequenceConfig;
  onComplete: (score: number) => void;
  soundOn: boolean;
  mode: GameMode;
  onAnswer?: (r: { correct: boolean; expected: string; given: string; question_id?: string; lesson_id?: string }) => void;
}

export default function StageSequenceGame({ config, onComplete, soundOn, mode, onAnswer }: GameProps) {
  const isTest = mode === 'test';
  const isLearning = mode === 'learning';
  const steps = useMemo(() => (config.steps || []).filter((s) => s && s.id), [config]);
  const checks = useMemo(() => sanitizeChecks(config.assessment), [config]);
  const [phase, setPhase] = useState<'steps' | 'checks'>('steps');
  const [stepIdx, setStepIdx] = useState(0);
  const [checkIdx, setCheckIdx] = useState(0);
  const [stepPaused, setStepPaused] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const scoreRef = useRef(0);
  const step = steps[stepIdx];
  const check = checks[checkIdx];

  const character = config.characters?.[0] || null;

  // Step narration TTS.
  const narrationSpokenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!step || phase !== 'steps') return;
    if (!soundOn) return;
    if (narrationSpokenRef.current.has(step.id)) return;
    narrationSpokenRef.current.add(step.id);
    const text = step.narration || step.label;
    const timer = setTimeout(() => speak(text).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [step, phase, soundOn]);

  // Auto-advance per durationSec (pause button stops the timer; manual
  // advance button is always available). Works for every mode — learning is
  // just the same watch flow with narration as the pace-setter.
  useEffect(() => {
    if (phase !== 'steps' || !step) return;
    if (stepPaused) return;
    const delay = (step.durationSec && step.durationSec >= 3 ? step.durationSec : 6) * 1000;
    const timer = setTimeout(() => {
      if (stepIdx + 1 >= steps.length) {
        if (checks.length > 0) setPhase('checks');
        else onComplete(0);
      } else {
        setStepIdx((i) => i + 1);
      }
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIdx, stepPaused, step]);

  // Advance a check after it settles (chip or tap-part).
  const handleCheckSettled = useCallback(
    (r: { correct: boolean; expected: string; given: string }) => {
      if (r.correct && !isTest) scoreRef.current += 10;
      if (isTest) scoreRef.current += r.correct ? 10 : 0;
      onAnswer?.({
        correct: r.correct,
        expected: r.expected,
        given: r.given,
        question_id: check?.id,
        lesson_id: config.lessonId,
      });
      setFinishing(true);
      const delay = isTest ? (r.correct ? 400 : 1000) : 700;
      setTimeout(() => {
        if (checkIdx + 1 >= checks.length) {
          if (soundOn && !isTest && !isLearning) playComplete();
          onComplete(scoreRef.current);
        } else {
          setCheckIdx((i) => i + 1);
          setFinishing(false);
        }
      }, delay);
    },
    [checkIdx, checks.length, isTest, isLearning, soundOn, onComplete, onAnswer, check, config.lessonId],
  );

  // TTS the scenario/speech once at game start.
  const introSpoken = useRef(false);
  useEffect(() => {
    if (introSpoken.current || !soundOn) return;
    introSpoken.current = true;
    const text = config.speechText || config.scenario || '';
    const timer = setTimeout(() => speak(text).catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepCount = Math.max(steps.length, 1);
  const checkCount = Math.max(checks.length, 1);

  if (steps.length === 0) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-800">{t('game.stageSequence.noSteps')}</p>
        {checks.length === 0 && <button type="button" onClick={() => onComplete(0)} className="mt-3 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white">{t('common.done')}</button>}
      </div>
    );
  }

  /* ── Watch phase ── */
  if (phase === 'steps') {
    return (
      <div className="space-y-4 select-none">
        {character && (
          <div className="flex items-center gap-3 animate-game-drop-in">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shadow-md overflow-hidden flex-shrink-0">
              {character.image ? (
                <CachedImg src={character.image} alt={character.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl">{character.emoji || character.name[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">{character.name}</p>
              {config.scenario && <p className="text-xs text-gray-500 truncate">{config.scenario}</p>}
            </div>
            <SpeakButton text={config.speechText || config.scenario || ''} size="sm" />
          </div>
        )}

        <p className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-2 text-center text-sm font-medium text-purple-600">
          {isLearning ? `📺 ${t('game.stageSequence.watch')}` : `👀 ${t('game.stageSequence.watch')}`}
        </p>

        {/* Step progress */}
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#0F4D92]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F4D92]">
            {t('game.stageSequence.step', { current: stepIdx + 1, total: stepCount })}
          </span>
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <div key={s.id} className={`h-2 w-2 rounded-full transition-all ${i < stepIdx ? 'bg-green-400' : i === stepIdx ? 'bg-[#0F4D92] animate-game-glow-pulse w-4' : 'bg-gray-200'}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { if (soundOn) playTap(); setStepPaused((p) => !p); }}
            className="rounded-lg px-2 py-1 text-lg hover:bg-gray-100 active:scale-95 transition-all"
            aria-label={stepPaused ? 'Play' : 'Pause'}
          >
            {stepPaused ? '▶️' : '⏸️'}
          </button>
        </div>

        {/* Step content — IN ORDER, never shuffled */}
        {step && (
          <div key={step.id} className="animate-game-slide-up">
            <div className="flex justify-center py-2">
              <StepGraphic step={step} />
            </div>
            <div className="mt-3 rounded-2xl bg-white border border-gray-200 px-4 py-3 text-center shadow-sm">
              <p className="text-xl font-extrabold text-gray-800">{step.label}</p>
              {step.narration && step.narration !== step.label && (
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{step.narration}</p>
              )}
              <div className="mt-2 flex justify-center gap-2">
                <SpeakButton text={step.narration || step.label} size="sm" />
              </div>
            </div>
          </div>
        )}

        {/* Manual advance */}
        <button
          type="button"
          onClick={() => {
            if (soundOn) playTap();
            if (stepIdx + 1 >= steps.length) {
              if (checks.length > 0) setPhase('checks');
              else onComplete(0);
            } else setStepIdx((i) => i + 1);
          }}
          className="mx-auto flex items-center gap-2 rounded-2xl bg-[#0F4D92] px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#0b3d76] active:scale-95"
        >
          {stepIdx + 1 >= steps.length
            ? `${t('game.stageSequence.startChecks')} →`
            : `${t('common.next')} →`}
        </button>
        {!isLearning && <p className="text-center text-[11px] text-gray-400">{t('game.stageSequence.tapHint')}</p>}
      </div>
    );
  }

  /* ── Check phase ── */
  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">
          {t('game.stageSequence.check', { current: checkIdx + 1, total: checkCount })}
        </span>
        <div className="flex items-center gap-1.5">
          {checks.map((c, i) => (
            <div key={c.id} className={`h-2 w-2 rounded-full transition-all ${i < checkIdx ? 'bg-green-400' : i === checkIdx ? 'bg-green-600 animate-game-glow-pulse w-4' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <p className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-center text-sm font-medium text-green-700">
        🎯 {t('game.stageSequence.checksIntro')}
      </p>

      {check && (
        <div key={check.id} className="animate-game-slide-up">
          {check.kind === 'label-diagram' ? (
            <TapPartCheck
              prompt={check.prompt}
              diagram={check.diagram}
              hotspots={check.hotspots}
              correctId={check.correctId}
              soundOn={soundOn}
              isTest={isTest}
              autoDemo={isLearning}
              onSettled={(r) => handleCheckSettled(r)}
              className="mx-auto max-w-md"
            />
          ) : (
            <ChipCheck
              check={check}
              isTest={isTest}
              isLearning={isLearning}
              soundOn={soundOn}
              onSettled={handleCheckSettled}
            />
          )}
        </div>
      )}

      {finishing && (
        <p className="animate-game-pop text-center text-sm font-bold text-green-600">{t('game.stageSequence.nice')} 🎉</p>
      )}
    </div>
  );
}
