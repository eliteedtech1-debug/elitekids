import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SpeechGame from '@/components/SpeechGame';

/**
 * Reachable entry for Q2 Voice-First speech practice (roadmap §2.5).
 * ?mode=letter|word|sentence picks a practice pack; the game engine will
 * later pass real lesson items directly to <SpeechGame items={...} />.
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

export default function SpeechPractice() {
  const [params] = useSearchParams();
  const mode = (['letter', 'word', 'sentence'] as const).find((m) => m === params.get('mode')) || 'word';
  const items = useMemo(() => PACKS[mode], [mode]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-emerald-50 px-4 pb-16 pt-6">
      <SpeechGame items={items} />
    </div>
  );
}
