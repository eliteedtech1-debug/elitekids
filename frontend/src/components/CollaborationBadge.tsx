/**
 * CollaborationBadge — peer-teaching achievement chip.
 *
 * Loads the learner's approved peer-teaching count for the current class so
 * the notification rail reflects real activity rather than placeholder data.
 */
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface CollaborationBadgeProps {
  classId?: string;
  childAdmissionNo?: string;
  className?: string;
}

export default function CollaborationBadge({ classId, childAdmissionNo, className = '' }: CollaborationBadgeProps) {
  const [peerTeachCount, setPeerTeachCount] = useState(0);

  useEffect(() => {
    if (!classId || !childAdmissionNo) return;
    let alive = true;
    apiClient
      .get(`${ENDPOINTS.COLLAB.PEER_TEACH_BOARD}?class_id=${encodeURIComponent(classId)}`)
      .then((res) => {
        if (!alive) return;
        const tips = Array.isArray(res.data?.data) ? res.data.data : [];
        setPeerTeachCount(tips.filter((tip: { child_admission_no?: string }) => tip.child_admission_no === childAdmissionNo).length);
      })
      .catch(() => {
        if (alive) setPeerTeachCount(0);
      });
    return () => { alive = false; };
  }, [classId, childAdmissionNo]);

  if (peerTeachCount <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-1 text-xs font-bold text-blue-700 shadow-sm ${className}`}
    >
      <BookOpen className="h-3 w-3" />
      {peerTeachCount === 1
        ? t('collab.peerTipSingular', { defaultValue: '1 peer tip shared' })
        : t('collab.peerTipPlural', { count: peerTeachCount, defaultValue: `${peerTeachCount} peer tips shared` })}
    </span>
  );
}
