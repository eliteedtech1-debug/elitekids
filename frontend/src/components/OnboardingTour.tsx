import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  CheckCircle2,
  Volume2,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { speak, playCorrect, playMatch, playTap } from '@/lib/utils/sound';
import { t } from '@/lib/i18n';

/* ── Onboarding steps ─────────────────────────────────────────── */

interface Step {
  id: string;
  title: string;
  description: string;
  shape: string;        // emoji
  shapeColor: string;   // tailwind bg
  action: 'tap' | 'drag' | 'match' | 'watch';
}

const STEP_META: Array<Pick<Step, 'id' | 'shape' | 'shapeColor' | 'action'>> = [
  {
    id: 'welcome',
    shape: '🌈',
    shapeColor: 'bg-gradient-to-br from-purple-400 to-pink-400',
    action: 'watch',
  },
  {
    id: 'tap',
    shape: '🔴',
    shapeColor: 'bg-red-400',
    action: 'tap',
  },
  {
    id: 'correct',
    shape: '✅',
    shapeColor: 'bg-green-400',
    action: 'watch',
  },
  {
    id: 'drag',
    shape: '🔵',
    shapeColor: 'bg-blue-400',
    action: 'drag',
  },
  {
    id: 'match',
    shape: '⭐',
    shapeColor: 'bg-amber-400',
    action: 'match',
  },
  {
    id: 'ready',
    shape: '🚀',
    shapeColor: 'bg-gradient-to-br from-green-400 to-emerald-500',
    action: 'watch',
  },
];

function getSteps(): Step[] {
  return STEP_META.map((step) => ({
    ...step,
    title: t(`onboarding.step.${step.id}.title`),
    description: t(`onboarding.step.${step.id}.description`),
  }));
}

/* ── Interactive tap demo ──────────────────────────────────────── */

function TapDemo({ onComplete }: { onComplete: () => void }) {
  const [tapped, setTapped] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const handleTap = async () => {
    if (tapped) return;
    setTapped(true);
    playCorrect();
    await speak('Red circle!');
    setShowCheck(true);
    setTimeout(onComplete, 1200);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-gray-500 font-medium">{t('onboarding.tapPrompt')}</p>
      <div className="relative">
        <button
          onClick={handleTap}
          className={`h-28 w-28 rounded-full bg-red-400 shadow-lg transition-all active:scale-90 ${
            tapped ? 'animate-game-jelly ring-4 ring-green-400' : 'animate-game-float hover:scale-110'
          }`}
        />
        {showCheck && (
          <div className="absolute inset-0 flex items-center justify-center animate-game-pop">
            <CheckCircle2 className="h-16 w-16 text-green-500 drop-shadow-lg" />
          </div>
        )}
      </div>
      {!tapped && (
        <div className="flex items-center gap-1 text-xs text-gray-400 animate-game-bounce">
          <span className="text-lg">👆</span> {t('onboarding.tapMe')}
        </div>
      )}
    </div>
  );
}

/* ── Interactive drag demo ─────────────────────────────────────── */

function DragDemo({ onComplete }: { onComplete: () => void }) {
  const [placed, setPlaced] = useState<number[]>([]);
  const items = [
    { id: 1, label: '1', color: 'bg-red-400' },
    { id: 2, label: '2', color: 'bg-blue-400' },
    { id: 3, label: '3', color: 'bg-green-400' },
  ];
  const remaining = items.filter((i) => !placed.includes(i.id));

  const handlePlace = async (item: { id: number; label: string }) => {
    if (item.id !== placed.length + 1) return; // wrong order
    playTap();
    const next = [...placed, item.id];
    setPlaced(next);
    await speak(item.label);
    if (next.length === items.length) {
      playCorrect();
      await speak('Great job!');
      setTimeout(onComplete, 1000);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-500 font-medium">{t('onboarding.dragPrompt')}</p>
      {/* Placed area */}
      <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-green-300 bg-green-50 p-4 min-h-[64px] w-full max-w-xs justify-center">
        {placed.length === 0 && (
          <span className="text-xs text-gray-400">{t('onboarding.tapBelow')}</span>
        )}
        {placed.map((id) => {
          const item = items.find((i) => i.id === id)!;
          return (
            <span
              key={id}
              className={`${item.color} text-white rounded-lg px-3 py-2 text-lg font-bold animate-game-slide-up`}
            >
              {item.label} ✓
            </span>
          );
        })}
      </div>
      {/* Remaining items */}
      <div className="flex gap-3">
        {remaining.map((item) => (
          <button
            key={item.id}
            onClick={() => handlePlace(item)}
            className={`${item.color} text-white h-16 w-16 rounded-xl text-2xl font-bold shadow-md transition-all hover:scale-110 active:scale-95 animate-game-zoom-in ${
              item.id !== placed.length + 1 ? 'opacity-50' : ''
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Interactive match demo ────────────────────────────────────── */

function MatchDemo({ onComplete }: { onComplete: () => void }) {
  const [selected, setSelected] = useState<{ side: 'a' | 'b'; idx: number } | null>(null);
  const [matchedA, setMatchedA] = useState<Set<number>>(new Set());

  const pairs = [
    { a: '⭐', b: 'Gold' },
    { a: '🔵', b: 'Blue' },
  ];

  const handlePick = async (side: 'a' | 'b', idx: number) => {
    playTap();
    if (!selected) {
      setSelected({ side, idx });
      return;
    }
    if (selected.side === side) {
      setSelected({ side, idx });
      return;
    }

    const aIdx = side === 'a' ? idx : selected.idx;
    if ((side === 'a' && selected.idx === aIdx) || (side === 'b' && selected.idx === aIdx)) {
      // Match!
      if (aIdx === 0 || aIdx === 1) {
        playMatch();
        const newMatched = new Set(matchedA);
        newMatched.add(aIdx);
        setMatchedA(newMatched);
        setSelected(null);
        await speak(aIdx === 0 ? 'Star matches Gold!' : 'Circle matches Blue!');
        if (newMatched.size === pairs.length) {
          playCorrect();
          await speak('All matched!');
          setTimeout(onComplete, 1000);
        }
      } else {
        setSelected(null);
      }
    } else {
      setSelected(null);
    }
  };

  const isMatched = (i: number) => matchedA.has(i);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-500 font-medium">{t('onboarding.matchPrompt')}</p>
      <div className="grid grid-cols-2 gap-6 w-full max-w-xs">
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <button
              key={`a-${i}`}
              onClick={() => handlePick('a', i)}
              className={`w-full rounded-xl border-2 p-4 text-3xl transition-all ${
                isMatched(i)
                  ? 'border-green-400 bg-green-50 opacity-70'
                  : selected?.side === 'a' && selected.idx === i
                  ? 'border-blue-500 bg-blue-50 shadow-lg animate-game-jelly'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              {p.a}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <button
              key={`b-${i}`}
              onClick={() => handlePick('b', i)}
              className={`w-full rounded-xl border-2 p-4 text-sm font-bold transition-all ${
                isMatched(i)
                  ? 'border-green-400 bg-green-50 opacity-70'
                  : selected?.side === 'b' && selected.idx === i
                  ? 'border-blue-500 bg-blue-50 shadow-lg animate-game-jelly'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              {p.b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Onboarding Tour ──────────────────────────────────────── */

export default function OnboardingTour({ onComplete }: { onComplete: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [demoDone, setDemoDone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const steps = getSteps();
  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // Speak step description on change
  useEffect(() => {
    if (!step) return;
    setDemoDone(step.action === 'watch');
    setSpeaking(true);
    speak(step.description).finally(() => setSpeaking(false));
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = async () => {
    playTap();
    if (isLast) {
      // Mark onboarding complete
      try {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
        const payload = token.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        const studentId = decoded.admission_no || decoded.id;
        await apiClient.post(ENDPOINTS.ONBOARDING.COMPLETE, { student_id: studentId }).catch(() => {});
      } catch {}
      onComplete();
      return;
    }
    setStepIdx((i) => i + 1);
    setDemoDone(false);
  };

  const handleBack = () => {
    playTap();
    setStepIdx((i) => Math.max(0, i - 1));
    setDemoDone(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#E7EEF6] to-white px-6">
      {/* Skip button */}
      <button
        onClick={() => {
          // Mark complete and skip
          const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
          try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            const studentId = decoded.admission_no || decoded.id;
            apiClient.post(ENDPOINTS.ONBOARDING.COMPLETE, { student_id: studentId }).catch(() => {});
          } catch {}
          onComplete();
        }}
        className="absolute top-4 right-4 text-sm text-gray-400 hover:text-gray-600 transition-all">{t('onboarding.skip')}</button>

      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i < stepIdx
                ? 'h-2.5 w-2.5 bg-green-400'
                : i === stepIdx
                ? 'h-3 w-8 bg-[#0F4D92]'
                : 'h-2.5 w-2.5 bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-sm text-center animate-game-slide-up">
        {/* Shape icon */}
        <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl ${step.shapeColor} shadow-lg animate-game-pop`}>
          <span className="text-4xl">{step.shape}</span>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-800">{step.title}</h1>
        <p className="mb-6 text-sm text-gray-500">{step.description}</p>

        {/* Interactive demo area */}
        <div className="mb-6 flex justify-center">
          {step.action === 'tap' && <TapDemo onComplete={() => setDemoDone(true)} />}
          {step.action === 'drag' && <DragDemo onComplete={() => setDemoDone(true)} />}
          {step.action === 'match' && <MatchDemo onComplete={() => setDemoDone(true)} />}
          {step.action === 'watch' && (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              {speaking && (
                <div className="flex items-center gap-2 animate-game-pop">
                  <Volume2 className="h-5 w-5 text-[#0F4D92] animate-game-bounce" />
                  <span className="text-xs">{t('onboarding.speaking')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-3">
          {stepIdx > 0 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-all active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" /> {t('onboarding.back')}
            </button>
          )}
          {step.action !== 'watch' && !demoDone ? (
            <div className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-400 animate-game-pulse">
              {t('onboarding.completeDemo')}
            </div>
          ) : (
            <button
              onClick={handleNext}
              className={`flex items-center gap-1 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 active:scale-95 animate-game-spring-in ${
                isLast
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                  : 'bg-[#0F4D92] hover:bg-[#0D3F7A]'
              }`}
            >
              {isLast ? (
                <>
                  <Gamepad2 className="h-4 w-4" /> {t('onboarding.play')}
                </>
              ) : (
                <>
                  {t('onboarding.next')} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
