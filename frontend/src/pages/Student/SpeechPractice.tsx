import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SpeechGame from '@/components/SpeechGame';
import PronunciationCoach from '@/components/PronunciationCoach';
import ReadingTracker from '@/components/ReadingTracker';
import { buildCoachPack, type CoachMode } from '@/lib/utils/speechCoach';

/**
 * Reachable entry for Q2 Voice-First speech practice (roadmap §2.5).
 * ?mode=letter|word|sentence picks a practice pack; the game engine will
 * later pass real lesson items directly to <SpeechGame items={...} />.
 *
 * Sub-tabs (Q25 leaf): Practice (SpeechGame), Coach (PronunciationCoach),
 * Tracker (ReadingTracker) — all over the live speech endpoints.
 */

type Mode = 'letter' | 'word' | 'sentence';

const PACKS: Record<Mode, { id: string; expected_text: string; mode: Mode }[]> = {
  letter: [
    { id: 'l1', expected_text: 'A', mode: 'letter' },
    { id: 'l2', expected_text: 'B', mode: 'letter' },
    { id: 'l3', expected_text: 'M', mode: 'letter' },
  ],
  word: [
    { id: 'w1', expected_text: 'book', mode: 'word' },
    { id: 'w2', expected_text: 'water', mode: 'word' },
    { id: 'w3', expected_text: 'school', mode: 'word' },
  ],
  sentence: [
    { id: 's1', expected_text: 'I love my school.', mode: 'sentence' },
    { id: 's2', expected_text: 'Nigeria is my country.', mode: 'sentence' },
  ],
};

type Tab = 'practice' | 'coach' | 'tracker';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'practice', label: 'Practice' },
  { id: 'coach', label: 'Coach' },
  { id: 'tracker', label: 'Tracker' },
];

export default function SpeechPractice() {
  const [params] = useSearchParams();
  const mode = (['letter', 'word', 'sentence'] as const).find((m) => m === params.get('mode')) || 'word';
  const items = useMemo(() => PACKS[mode], [mode]);
  const [tab, setTab] = useState<Tab>('practice');

  const coachItems = useMemo(() => buildCoachPack('word', 5), []);
  const trackerItems = useMemo(() => buildCoachPack('sentence', 5), []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-emerald-50 px-4 pb-16 pt-6">
      {/* Sub-tabs */}
      <div className="mx-auto mb-4 flex w-full max-w-md gap-1.5 rounded-2xl border border-teal-200/60 bg-white/80 p-1.5 shadow-sm backdrop-blur-xl">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-black transition-all active:scale-95 ${
              tab === tb.id
                ? 'bg-gradient-to-r from-[#0F4D92] to-[#0d9488] text-white shadow-md'
                : 'text-teal-700 hover:bg-teal-50'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'practice' && <SpeechGame items={items} />}
      {tab === 'coach' && <PronunciationCoach items={coachItems} />}
      {tab === 'tracker' && <ReadingTracker items={trackerItems} />}
    </div>
  );
}