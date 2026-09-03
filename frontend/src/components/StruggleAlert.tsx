import { AlertTriangle, Lightbulb } from 'lucide-react';

export type StruggleSeverity = 'none' | 'low' | 'medium' | 'high';

interface StruggleAlertProps {
  severity: StruggleSeverity;
  prompt?: string;
  onDismiss?: () => void;
  onShowHint?: () => void;
}

const CONFIG: Record<Exclude<StruggleSeverity, 'none'>, {
  title: string;
  border: string;
  iconBg: string;
  text: string;
}> = {
  low: {
    title: 'A little tricky',
    border: 'border-yellow-400/30',
    iconBg: 'bg-yellow-400/20',
    text: 'text-yellow-300',
  },
  medium: {
    title: 'Struggling a bit',
    border: 'border-orange-400/40',
    iconBg: 'bg-orange-400/20',
    text: 'text-orange-300',
  },
  high: {
    title: 'Getting hard — let’s help!',
    border: 'border-red-400/40',
    iconBg: 'bg-red-400/20',
    text: 'text-red-300',
  },
};

export default function StruggleAlert({ severity, prompt, onDismiss, onShowHint }: StruggleAlertProps) {
  if (!severity || severity === 'none') return null;
  const cfg = CONFIG[severity];

  return (
    <div className={`flex items-center gap-3 rounded-2xl border ${cfg.border} bg-white/5 px-4 py-3`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.iconBg}`}>
        <AlertTriangle className={`h-5 w-5 ${cfg.text}`} />
      </div>
      <div className="flex-1">
        <div className={`text-sm font-bold ${cfg.text}`}>{cfg.title}</div>
        {prompt && <div className="text-xs text-white/60">{prompt}</div>}
      </div>
      {onShowHint && (
        <button
          onClick={onShowHint}
          className="flex items-center gap-1 rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-400/30"
        >
          <Lightbulb className="h-3.5 w-3.5" /> Hint
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="text-xs text-white/40 transition hover:text-white/60" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
