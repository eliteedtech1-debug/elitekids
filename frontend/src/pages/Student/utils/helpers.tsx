/**
 * Shared student-dashboard helpers (STUDENT-TAB-RESTRUCTURE.md).
 *
 * These were copy-pasted into StudentHome.tsx, tabs/PlayTab.tsx,
 * tabs/StatsTab.tsx and StudentLeaderboardPanel.tsx. They now live here and
 * every tab imports them, so a fix lands everywhere at once.
 */
import { AGE_LEVEL_COLORS } from '@/lib/utils/accessibility';
import type { LessonCard } from '../tabs/types';

/** Soft blurred background blob used for depth on cards and the header. */
export function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-20 ${className}`} />
  );
}

/** Age-level pill colours (colourblind-safe palette when the mode is on). */
export function getAgeColor(ageLevel: string, colorblind: boolean): string {
  const entry = AGE_LEVEL_COLORS[ageLevel];
  if (!entry) return 'bg-gray-100 text-gray-600';
  return colorblind ? entry.colorblind : entry.standard;
}

/** Subject chips for the PLAY grid — the old per-subject tabs, minus the tabs. */
export const SUBJECT_FILTERS: Array<{ key: string; labelKey: string; test: (l: LessonCard) => boolean }> = [
  { key: 'all', labelKey: 'student.filter.all', test: () => true },
  { key: 'numbers', labelKey: 'student.tab.numbers', test: (l) => /count|number|math|drag-sort/i.test(l.subject + l.title) },
  { key: 'letters', labelKey: 'student.tab.letters', test: (l) => /abc|letter|english|phon/i.test(l.subject + l.title) },
  { key: 'colors', labelKey: 'student.tab.colors', test: (l) => /color|art|creati/i.test(l.subject + l.title) },
  { key: 'shapes', labelKey: 'student.tab.shapes', test: (l) => /shape|pattern|geom/i.test(l.subject + l.title) },
  { key: 'animals', labelKey: 'student.tab.animals', test: (l) => /animal|pet|farm/i.test(l.subject + l.title) },
  { key: 'food', labelKey: 'student.tab.food', test: (l) => /fruit|veggie|food|eat/i.test(l.subject + l.title) },
];

/** PLAY grid sections — the progression order a child is meant to meet them in. */
export const HOME_SECTION_LABEL: Record<string, string> = {
  next: 'student.home.sectionNext',
  open: 'student.home.sectionUnlocked',
  locked: 'student.home.sectionLocked',
};
