/**
 * StudentAlertCard — struggling student card for teacher view.
 *
 * Shows a single student who needs attention with mastery info and
 * suggested action.
 */
import { AlertTriangle, User } from 'lucide-react';

interface StudentAlert {
  child_admission_no: string;
  name?: string;
  skill_key?: string;
  mastery_probability: number;
  sessions?: number;
}

interface StudentAlertCardProps {
  student: StudentAlert;
  onAction?: (student: StudentAlert) => void;
}

export default function StudentAlertCard({ student, onAction }: StudentAlertCardProps) {
  const mp = Math.round((student.mastery_probability || 0) * 100);
  const isCritical = mp < 25;

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
      isCritical ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30'
    }`}>
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        isCritical ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
      }`}>
        {student.name ? (
          <span className="text-sm font-bold">{student.name.charAt(0)}</span>
        ) : (
          <User className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">
          {student.name || student.child_admission_no}
        </p>
        <p className="text-[11px] text-gray-500">
          {student.skill_key || 'Multiple skills'} · {mp}% mastery
          {student.sessions ? ` · ${student.sessions} sessions` : ''}
        </p>
      </div>
      {onAction && (
        <button
          onClick={() => onAction(student)}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 shadow-sm hover:bg-gray-50"
        >
          Review
        </button>
      )}
    </div>
  );
}
