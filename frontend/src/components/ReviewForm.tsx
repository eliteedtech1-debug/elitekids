import { useState } from 'react';
import { Star } from 'lucide-react';

interface ReviewFormProps { onSubmit: (rating: number, comment: string) => Promise<void>; disabled?: boolean; }

export default function ReviewForm({ onSubmit, disabled = false }: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try { await onSubmit(rating, comment.trim()); setComment(''); } finally { setSaving(false); }
  };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-extrabold text-gray-800">Review a resource</h3>
      <div className="mt-2 flex gap-1" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`}><Star className={`h-5 w-5 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} /></button>)}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="What helped your learners?" className="mt-3 min-h-20 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none" />
      <button onClick={submit} disabled={disabled || saving} className="mt-2 rounded-xl bg-[#0F4D92] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save review'}</button>
    </div>
  );
}
