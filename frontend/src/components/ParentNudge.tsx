/**
 * ParentNudge — toast for high-priority insight (e.g. streak at risk).
 *
 * Shows a small, dismissible nudge at the top of the parent dashboard
 * for the most urgent insight.
 */
import { AlertTriangle, X } from 'lucide-react';
import { t } from '@/lib/i18n';

interface ParentNudgeProps {
  title: string;
  body: string;
  onDismiss?: () => void;
}

export default function ParentNudge({ title, body, onDismiss }: ParentNudgeProps) {
  return (
    <div className="relative rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-amber-800">{title}</p>
          <p className="mt-0.5 text-xs text-amber-700">{body}</p>
        </div>
      </div>
    </div>
  );
}
