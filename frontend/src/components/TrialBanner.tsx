// TrialBanner — amber ribbon for schools inside their 14-day auto-trial.
// Shows days remaining + subscribe CTA (opens the authenticated plans modal
// flow via /kids/subscription/initiate). Renders nothing when not on trial.
import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';

interface StatusResponse {
  success?: boolean;
  data?: {
    subscriber?: { plan_code?: string; status?: string; expires_at?: string | null } | null;
    active?: boolean;
    tier?: string;
  };
}

const PLAN_PRICES: Record<string, string> = { kids_term: '500', kids_annual: '1200' };

export default function TrialBanner() {
  const [trial, setTrial] = useState<{ daysLeft: number; expired: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Children NEVER see payment UI — banner is for staff/parents only.
    let userType = '';
    try { userType = (JSON.parse(localStorage.getItem('user_data') || '{}')?.user_type || '').toLowerCase(); } catch { /* ignore */ }
    if (userType.includes('student') || userType.includes('child')) return;
    apiClient
      .get('/kids/subscription/status')
      .then((res) => {
        const d = (res.data as StatusResponse)?.data;
        const sub = d?.subscriber;
        if (d?.active && sub?.status === 'trial' && sub.expires_at) {
          const exp = new Date(String(sub.expires_at).includes('T') ? sub.expires_at : String(sub.expires_at).replace(' ', 'T'));
          const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
          setTrial({ daysLeft, expired: daysLeft <= 0 });
        }
      })
      .catch(() => { /* silent — banner is optional chrome */ });
  }, []);

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/kids/subscription/initiate', { plan_code: 'kids_annual' });
      const url = res.data?.data?.authorization_url;
      if (url) window.location.href = url;
      else toast.error('Could not start payment.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  };

  if (!trial || dismissed) return null;

  return (
    <div className={`relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm font-medium ${trial.expired ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
      <span className="flex items-center gap-1.5">
        <Clock className="h-4 w-4" />
        {trial.expired
          ? 'Your free trial has ended — subscribe to keep access.'
          : `Free trial: ${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left`}
      </span>
      <button
        onClick={subscribe}
        disabled={busy}
        className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? 'Opening checkout…' : `Subscribe — ₦${PLAN_PRICES.kids_annual}/year`}
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="absolute right-2 rounded p-1 opacity-50 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
