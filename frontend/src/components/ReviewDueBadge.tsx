import { BookOpenCheck } from 'lucide-react';

interface ReviewDueBadgeProps {
  dueCount: number;
  onClick?: () => void;
}

export default function ReviewDueBadge({ dueCount, onClick }: ReviewDueBadgeProps) {
  if (!dueCount) return null;

  return (
    <button
      onClick={onClick}
      aria-label={`${dueCount} review${dueCount === 1 ? '' : 's'} due — tap to review`}
      className="relative flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-300 transition hover:bg-violet-400/20 hover:scale-105 active:scale-95"
    >
      <BookOpenCheck className="h-4 w-4 animate-game-bounce" />
      <span>{dueCount} review{dueCount === 1 ? '' : 's'} due</span>
      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-purple-500 px-1 text-[11px] font-bold text-white shadow animate-game-pulse">
        {dueCount}
      </span>
    </button>
  );
}
