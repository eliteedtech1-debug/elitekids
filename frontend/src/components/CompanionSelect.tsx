import { useState, useEffect, useRef } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { speak, playTap } from '@/lib/utils/sound';

/* ── Companion types & data ────────────────────────────────────── */

interface CompanionData {
  companion_type: string;
  customization: { expression: string; accessory: string | null };
}

const COMPANIONS = [
  { type: 'fox', emoji: '🦊', name: 'Foxy', greeting: "Hi there! I'm Foxy! Let's play together!" },
  { type: 'owl', emoji: '🦉', name: 'Hootie', greeting: "Hello! I'm Hootie! Ready to learn?" },
  { type: 'bunny', emoji: '🐰', name: 'Bunny', greeting: "Hey! I'm Bunny! Let's have fun!" },
  { type: 'bear', emoji: '🐻', name: 'Bear', greeting: "Hi! I'm Bear! Let's explore!" },
  { type: 'cat', emoji: '🐱', name: 'Whiskers', greeting: "Meow! I'm Whiskers! Let's play!" },
];

const EXPRESSIONS: Record<string, Record<string, string>> = {
  fox:    { happy: '🦊', excited: '🦊', sleepy: '😴',鼓励: '🦊' },
  owl:    { happy: '🦉', excited: '🦉', sleepy: '😴', encourage: '🦉' },
  bunny:  { happy: '🐰', excited: '🐰', sleepy: '😴', encourage: '🐰' },
  bear:   { happy: '🐻', excited: '🐻', sleepy: '😴', encourage: '🐻' },
  cat:    { happy: '🐱', excited: '🐱', sleepy: '😴', encourage: '🐱' },
};

const GREETINGS: Record<string, string[]> = {
  returning: [
    "Welcome back! I missed you! 🌟",
    "Yay, you're here! Let's play! 🎮",
    "So happy to see you again! ✨",
  ],
  before_game: [
    "Ready to learn something cool? 🌈",
    "You're going to do great! 💪",
    "Let's have an awesome time! 🎉",
  ],
  after_correct: [
    "Amazing work! ⭐",
    "You're so smart! 🧠",
    "Woohoo! Keep going! 🚀",
  ],
  after_wrong: [
    "That's okay! Let's try again! 💪",
    "You'll get it next time! 🌟",
    "No worries, practice makes perfect! 🌈",
  ],
  break_time: [
    "Great job today! Let's take a little rest! 😴",
    "You've been working hard! Time for a break! ⭐",
    "Awesome play! Let's rest a bit! 🌈",
  ],
};

function getGreeting(context: 'returning' | 'before_game' | 'after_correct' | 'after_wrong' | 'break_time'): string {
  const options = GREETINGS[context] || GREETINGS.returning;
  return options[Math.floor(Math.random() * options.length)];
}

/* ── Companion Bubble (inline greeting) ────────────────────────── */

export function CompanionBubble({
  companion,
  context = 'returning',
  onDismiss,
}: {
  companion: CompanionData | null;
  context?: 'returning' | 'before_game' | 'after_correct' | 'after_wrong' | 'break_time';
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const spokenRef = useRef(false);

  // Speak greeting once (must be before any early return per React hooks rules)
  useEffect(() => {
    if (!companion || dismissed || spokenRef.current) return;
    spokenRef.current = true;
    const greeting = getGreeting(context);
    speak(greeting).catch(() => {});
  }, [companion, dismissed, context]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!companion || dismissed) return null;

  const info = COMPANIONS.find((c) => c.type === companion.companion_type) || COMPANIONS[0];
  const greeting = getGreeting(context);

  return (
    <div
      className="flex items-center gap-3 rounded-2xl bg-white border border-amber-200 shadow-md p-3 animate-game-slide-up cursor-pointer"
      onClick={() => {
        playTap();
        setDismissed(true);
        onDismiss?.();
      }}
    >
      <span className="text-3xl animate-game-float">{info.emoji}</span>
      <div className="flex-1">
        <p className="text-xs font-bold text-amber-700">{info.name}</p>
        <p className="text-sm text-gray-600">{greeting}</p>
      </div>
      <span className="text-xs text-gray-400">tap to close</span>
    </div>
  );
}

/* ── Companion Select (first-time choosing) ────────────────────── */

export default function CompanionSelect({ onComplete }: { onComplete: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChoose = async (type: string) => {
    playTap();
    setSelected(type);
    setSaving(true);

    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const studentId = decoded.admission_no || decoded.id;

      const info = COMPANIONS.find((c) => c.type === type)!;
      await apiClient.post(ENDPOINTS.COMPANION.CHOOSE, {
        student_id: studentId,
        companion_type: type,
      });
      await speak(info.greeting);
      setTimeout(onComplete, 1500);
    } catch {
      setSaving(false);
      setSelected(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 animate-game-pop">
          <span className="text-5xl">🌟</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800">Choose Your Buddy!</h1>
        <p className="mb-6 text-sm text-gray-500">Pick a friend to play with you!</p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {COMPANIONS.map((c, i) => (
            <button
              key={c.type}
              onClick={() => handleChoose(c.type)}
              disabled={saving}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all animate-game-slide-up ${
                selected === c.type
                  ? 'border-amber-400 bg-amber-50 shadow-lg animate-game-jelly'
                  : selected
                  ? 'border-gray-200 bg-white opacity-50'
                  : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-md hover:animate-game-squish'
              }`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="text-4xl">{c.emoji}</span>
              <span className="text-xs font-bold text-gray-700">{c.name}</span>
            </button>
          ))}
        </div>

        {selected && (
          <p className="text-sm text-amber-600 animate-game-pop">
            {COMPANIONS.find((c) => c.type === selected)?.greeting}
          </p>
        )}
      </div>
    </div>
  );
}

export { COMPANIONS, getGreeting };
