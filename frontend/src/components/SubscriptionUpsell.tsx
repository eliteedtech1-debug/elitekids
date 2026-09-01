import { useState, useEffect, useCallback } from 'react';
import { X, CreditCard, Check, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t } from '@/lib/i18n';

interface Plan {
  id: string;
  code: string;
  name: string;
  amount_ngn: number;
  billing_period: string;
  currency: string;
}

interface SubscriptionUpsellProps {
  open: boolean;
  onClose: () => void;
  errorCode?: string;
}

export default function SubscriptionUpsell({ open, onClose, errorCode }: SubscriptionUpsellProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      apiClient.get('/kids/subscription/plans')
        .then((res) => setPlans(res.data?.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSubscribe = useCallback(async (planCode: string) => {
    setProcessing(true);
    try {
      const res = await apiClient.post('/kids/subscription/initiate', { plan_code: planCode });
      const url = res.data?.data?.authorization_url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error(t('upsell.paymentFailed'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('upsell.paymentFailed'));
    } finally {
      setProcessing(false);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="relative border-b px-6 py-5 text-center">
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-2xl shadow-lg">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-lg font-extrabold text-gray-800">{t('upsell.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('upsell.subtitle')}</p>
        </div>

        {/* Plans */}
        <div className="px-6 py-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">{t('upsell.loading')}</div>
          ) : plans.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">{t('upsell.noPlans')}</div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-xl border-2 border-gray-100 p-4 transition-all hover:border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-extrabold text-gray-800">{plan.name}</p>
                      <p className="text-xs text-gray-500">
                        {plan.billing_period === 'annual' ? t('upsell.annual') : t('upsell.term')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-extrabold text-orange-600">
                        {plan.currency} {plan.amount_ngn.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSubscribe(plan.code)}
                    disabled={processing}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-2.5 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {processing ? t('upsell.processing') : t('upsell.subscribe')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Features */}
        <div className="border-t px-6 py-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{t('upsell.includes')}</p>
          <ul className="space-y-1.5">
            {['allGames', 'progressTracking', 'liveAudio', 'adaptiveLearning'].map((key) => (
              <li key={key} className="flex items-center gap-2 text-sm text-gray-600">
                <Check className="h-4 w-4 text-green-500" />
                {t(`upsell.feature_${key}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 text-center">
          <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
            {t('upsell.maybeLater')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to detect SUBSCRIPTION_REQUIRED 403 errors and show upsell.
 * Usage: const { showUpsell, setShowUpsell } = useSubscriptionUpsell();
 */
export function useSubscriptionUpsell() {
  const [showUpsell, setShowUpsell] = useState(false);
  const [errorCode, setErrorCode] = useState<string>('');

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.error_code === 'SUBSCRIPTION_REQUIRED') {
        setErrorCode(e.detail.error_code);
        setShowUpsell(true);
      }
    };
    window.addEventListener('kids:auth-error', handler as EventListener);
    return () => window.removeEventListener('kids:auth-error', handler as EventListener);
  }, []);

  return { showUpsell, setShowUpsell, errorCode };
}
