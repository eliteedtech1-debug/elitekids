/**
 * PeerTeachingBoard — browse + record peer explanations (text-only v1).
 *
 * Shows approved peer tips from classmates and lets the student record
 * their own explanation for a skill.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, BookOpen, Plus, Send, ThumbsUp } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import { useCollabSocket, type CollabEvent } from '@/lib/live/useCollabSocket';

interface PeerTip {
  id: number;
  child_admission_no: string;
  subject: string;
  skill_key: string;
  explanation_text: string;
  helps_count: number;
  created_at: string;
}

interface PeerTeachingBoardProps {
  classId: string;
  childAdmissionNo: string;
}

export default function PeerTeachingBoard({ classId, childAdmissionNo }: PeerTeachingBoardProps) {
  const [tips, setTips] = useState<PeerTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBoard = useCallback(async (filterSubject?: string) => {
    try {
      const params = filterSubject ? `?subject=${encodeURIComponent(filterSubject)}` : '';
      const res = await apiClient.get(`${ENDPOINTS.COLLAB.PEER_TEACH_BOARD}${params}`);
      setTips(res.data?.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const onWsEvent = useCallback((event: CollabEvent) => {
    if (event === 'peer-teach:new') {
      loadBoard();
      toast(t('collab.newPeerTip', { defaultValue: 'A classmate shared a helpful tip!' }));
    }
  }, [loadBoard]);

  useCollabSocket({
    rooms: [`class:${classId}`],
    onEvent: onWsEvent,
  });

  const recordTip = async () => {
    if (!explanation.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.COLLAB.PEER_TEACH_RECORD, {
        class_id: classId,
        subject: subject.trim() || null,
        explanation_text: explanation.trim(),
      });
      setExplanation('');
      setSubject('');
      setShowForm(false);
      loadBoard();
      toast.success('Tip shared! Thank you!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not share tip');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800">
          <BookOpen className="h-4 w-4 text-blue-500" />
          {t('collab.coach', { defaultValue: 'Coach Corner' })}
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition hover:bg-blue-100"
        >
          <Plus className="h-3 w-3" />
          {showForm ? t('common.cancel') : 'Share a tip'}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g. Math, English)"
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Explain in your own words..."
            rows={3}
            maxLength={2000}
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <p className="mb-2 text-[10px] text-gray-400">{explanation.length}/2000</p>
          <button
            onClick={recordTip}
            disabled={submitting || !explanation.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-3 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Share tip
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tips...
        </div>
      ) : tips.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {t('collab.coachEmpty', { defaultValue: 'No tips yet. Be the first to teach a friend!' })}
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {tips.map((tip) => (
            <div key={tip.id} className="rounded-xl border border-gray-100 bg-white/60 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-500">
                  {tip.subject || tip.skill_key || 'General'}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <ThumbsUp className="h-3 w-3" /> {tip.helps_count || 0}
                </span>
              </div>
              <p className="text-sm text-gray-700">{tip.explanation_text}</p>
              <p className="mt-1 text-[10px] text-gray-400">
                by {tip.child_admission_no === childAdmissionNo ? 'You' : tip.child_admission_no}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
