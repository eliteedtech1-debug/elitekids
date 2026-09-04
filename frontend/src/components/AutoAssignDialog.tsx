/**
 * AutoAssignDialog — confirmation modal for auto-assign.
 *
 * Shows a modal with the list of students and suggested assignments
 * before the teacher confirms the bulk auto-assign action.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface AssignIntent {
  child_admission_no: string;
  action: 'assign' | 'review';
  lesson_id?: string;
  skill_key?: string;
}

interface AutoAssignDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  intents: AssignIntent[];
  onDone?: () => void;
}

export default function AutoAssignDialog({ open, onClose, classId, intents, onDone }: AutoAssignDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const confirm = async () => {
    setLoading(true);
    try {
      await apiClient.post(ENDPOINTS.TEACHER_AI.AUTO_ASSIGN, {
        class_id: classId,
        assignments: intents,
      });
      toast.success(`Assigned ${intents.length} items`);
      onDone?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Auto-assign failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-gray-800">Auto-Assign</h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-sm text-gray-600">
          {intents.length} item{intents.length === 1 ? '' : 's'} will be assigned:
        </p>

        <div className="mb-4 max-h-60 space-y-1.5 overflow-y-auto">
          {intents.map((intent, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs">
              {intent.action === 'review' ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              )}
              <span className="font-medium text-gray-700">{intent.child_admission_no}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{intent.action}{intent.skill_key ? ` (${intent.skill_key})` : ''}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={confirm}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-4 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
