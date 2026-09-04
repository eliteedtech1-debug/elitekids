/**
 * ActionItem — checkbox recommendation from the insight engine.
 *
 * Shows a single action item with an ack/done toggle.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface ActionItemData {
  id: number;
  child_admission_no: string;
  title: string;
  description?: string;
  ack_status: 'pending' | 'ack' | 'done';
  created_at: string;
}

interface ActionItemProps {
  item: ActionItemData;
  onDone?: (id: number) => void;
}

export default function ActionItem({ item, onDone }: ActionItemProps) {
  const [status, setStatus] = useState(item.ack_status);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (status === 'done') return;
    setLoading(true);
    try {
      await apiClient.post(ENDPOINTS.PARENT_INTEL.ACTION_ACK, {
        action_item_id: item.id,
        status: 'done',
      });
      setStatus('done');
      onDone?.(item.id);
      toast.success(t('parentIntel.actionDone', { defaultValue: 'Action done' }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading || status === 'done'}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
        status === 'done'
          ? 'border-green-200 bg-green-50/50'
          : 'border-gray-200 bg-white/60 hover:border-blue-200 hover:bg-blue-50/30'
      }`}
    >
      {loading ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 animate-spin" />
      ) : status === 'done' ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
        )}
      </div>
    </button>
  );
}
