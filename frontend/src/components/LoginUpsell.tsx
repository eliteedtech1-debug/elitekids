// Login-wall upsell — shown when a school without an active subscription or
// trial tries to log in (403 SCHOOL_NOT_SUBSCRIBED). Renders the school's
// crest/name, paid plans with one-tap Paystack checkout (session-free via
// public-initiate/public-verify), a demo link to the flagship showcase, and
// a contact-sales mailto.
import { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, ExternalLink, Mail, Check, Loader2, GraduationCap, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';

interface Plan {
  code: string;
  name: string;
  amount_ngn: number;
  billing_period: string;
  currency: string;
}

export interface LoginUpsellPayload {
  message?: string;
  school?: { school_id: string; school_name?: string; short_name?: string; badge_url?: string | null } | null;
  plans?: Plan[];
  subscription?: { plan_code?: string; status?: string; expires_at?: string | null } | null;
  demo?: { label?: string; url?: string } | null;
}

const SALES_EMAIL = 'sales@eliteedutech.com.ng';

function planPriceLabel(plan: Plan) {
  const period = plan.billing_period === 'annual' ? '/year' : '/term';
  return `₦${Number(plan.amount_ngn).toLocaleString()}${period}`;
}

/** One-tap Paystack checkout without a session (login wall). */
export async function startPublicCheckout(planCode: string, email: string, payload: LoginUpsellPayload) {
  const res = await apiClient.post('/kids/subscription/public-initiate', {
    plan_code: planCode,
    email,
    school_id: payload.school?.school_id,
    short_name: payload.school?.short_name,
  });
  const url = res.data?.data?.authorization_url;
  const reference = res.data?.data?.reference;
  if (url) {
    if (reference) sessionStorage.setItem('kids:pending-sub-ref', reference);
    window.location.href = url;
    return true;
  }
  throw new Error(res.data?.message || 'Could not start payment.');
}

/** Verify the Paystack return (?sub=success&reference=…) after checkout. */
export async function verifyPendingSubscription(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get('reference') || sessionStorage.getItem('kids:pending-sub-ref');
  const marked = params.get('sub') === 'success';
  if (!marked || !reference) return false;

  params.delete('sub');
  params.delete('reference');
  params.delete('trxref');
  sessionStorage.removeItem('kids:pending-sub-ref');
  const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
  window.history.replaceState({}, '', clean);

  try {
    await apiClient.post('/kids/subscription/public-verify', { reference });
    toast.success('Subscription active! You can log in now 🎉');
    return true;
  } catch (err: any) {
    toast.error(err?.message || 'Payment verification failed — please try again or contact support.');
    return false;
  }
}

export default function LoginUpsell({ payload, onClose }: { payload: LoginUpsellPayload; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('user_data') || '{}');
      if (saved?.email) setEmail((p) => p || saved.email);
    } catch { /* ignore */ }
  }, []);

  const subscribe = useCallback(async (plan: Plan) => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setShowEmail(true);
      toast.error('Enter the school admin email to receive the receipt.');
      return;
    }
    setBusyPlan(plan.code);
    try {
      await startPublicCheckout(plan.code, email.trim(), payload);
    } catch (err: any) {
      toast.error(err?.message || 'Could not start payment.');
      setBusyPlan(null);
    }
  }, [email, payload]);

  const plans = (payload.plans || []).filter((p) => p.billing_period !== 'free');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#0F4D92] via-[#0d9488] to-[#0a1628] px-6 pb-6 pt-7 text-center text-white">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full bg-white/10 px-2.5 py-1 text-sm text-white/80 hover:bg-white/20"
          >
            ✕
          </button>
          {payload.school?.badge_url ? (
            <img src={payload.school.badge_url} alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl border-2 border-white/30 bg-white/90 object-contain p-1" />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/20">
              <GraduationCap className="h-8 w-8" />
            </div>
          )}
          <h2 className="text-xl font-extrabold leading-tight">
            {payload.school?.school_name || 'Your school'} isn't subscribed
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-blue-100/85">
            {payload.message || 'Subscribe to unlock all learning games for every teacher and student.'}
          </p>
        </div>

        {/* Plans */}
        <div className="space-y-3 px-6 py-5">
          {plans.map((plan) => {
            const annual = plan.billing_period === 'annual';
            return (
              <button
                key={plan.code}
                onClick={() => subscribe(plan)}
                disabled={busyPlan !== null}
                className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-all disabled:opacity-60 ${
                  annual ? 'border-teal-500 bg-teal-50 hover:bg-teal-100' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/40'
                }`}
              >
                <span>
                  <span className="flex items-center gap-2 font-bold text-gray-800">
                    {annual && <Sparkles className="h-4 w-4 text-teal-600" />}
                    {annual ? 'Annual' : 'Per Term'} — {planPriceLabel(plan)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {annual ? 'Best value · all games, all children, 12 months' : 'All games, all children, one term'}
                  </span>
                </span>
                <span className="ml-3 flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white shadow">
                  {busyPlan === plan.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Subscribe
                </span>
              </button>
            );
          })}
          {plans.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">
              Plans are loading… If this persists, contact {SALES_EMAIL}.
            </p>
          )}

          {showEmail && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="schooladmin@email.com"
              className="w-full rounded-xl border-2 border-teal-200 px-4 py-2.5 text-sm outline-none focus:border-teal-500"
              autoFocus
            />
          )}

          {/* Demo + contact */}
          <div className="flex items-center gap-2 pt-1">
            {payload.demo?.url && (
              <a
                href={payload.demo.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {payload.demo.label || 'Try the demo'} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <a
              href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`EliteKids subscription — ${payload.school?.school_name || payload.school?.school_id || 'school'}`)}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Contact sales <Mail className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="flex items-center justify-center gap-1 pt-1 text-[11px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure payment via Paystack · card, transfer & USSD
          </p>
        </div>
      </div>
    </div>
  );
}
