/**
 * ContentSuggestion — suggested activity card with one-click assign.
 *
 * Shows a content gap or suggested activity for a teacher to assign.
 */
import { BookOpen, ArrowRight } from 'lucide-react';

interface Suggestion {
  id: number;
  class_id: string;
  suggestion_type: string;
  title: string;
  body: string;
  strand?: string;
  priority: string;
  meta?: Record<string, any>;
}

interface ContentSuggestionProps {
  suggestion: Suggestion;
  onAssign?: (suggestion: Suggestion) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-red-200 bg-red-50/80',
  medium: 'border-amber-200 bg-amber-50/80',
  low: 'border-green-200 bg-green-50/80',
};

export default function ContentSuggestion({ suggestion, onAssign }: ContentSuggestionProps) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${PRIORITY_COLORS[suggestion.priority] || PRIORITY_COLORS.low}`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <BookOpen className="h-4 w-4 text-blue-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800">{suggestion.title}</p>
          <p className="mt-0.5 text-xs text-gray-600">{suggestion.body}</p>
          {suggestion.meta?.coverage_pct != null && (
            <p className="mt-1 text-[11px] font-semibold text-gray-500">
              Coverage: {suggestion.meta.coverage_pct}%
            </p>
          )}
        </div>
        {onAssign && suggestion.suggestion_type !== 'gap' && (
          <button
            onClick={() => onAssign(suggestion)}
            className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-[#0F4D92] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#0d4280]"
          >
            Assign <ArrowRight className="h-3 w-3" />
          </button>
        )}
        {suggestion.suggestion_type === 'gap' && (
          <span className="shrink-0 rounded-xl bg-white/70 px-2.5 py-1.5 text-[10px] font-bold text-gray-500">
            Review gap
          </span>
        )}
      </div>
    </div>
  );
}
