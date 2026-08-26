import { useEffect, useState } from 'react';
import { WifiOff, Download, RefreshCw } from 'lucide-react';
import { t } from '@/lib/i18n';
import { canPrefetch } from '@/lib/utils/storage-budget';

/**
 * Offline banner for game play — shown when the student is offline
 * and playing a cached game. Explains that progress will sync later.
 *
 * Props:
 *   - hasQueuedProgress: whether there are pending progress records
 *   - onRetry: callback to retry loading from cache
 */
interface OfflineBannerProps {
  hasQueuedProgress?: boolean;
  /** E2: number of progress records waiting to sync */
  pending?: number;
  /** E2: number of sync items that errored */
  failed?: number;
  onRetry?: () => void;
  className?: string;
}

export default function OfflineBanner({
  hasQueuedProgress = false,
  pending = 0,
  failed = 0,
  onRetry,
  className = '',
}: OfflineBannerProps) {
  if (navigator.onLine) return null;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700 backdrop-blur-sm ${className}`}
    >
      <WifiOff className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1">
        <p className="font-semibold">{t('offline.banner.offlineTitle')}</p>
        <p className="text-xs text-amber-600">
          {hasQueuedProgress
            ? t('offline.banner.savedWillSync')
            : t('offline.banner.cacheWillSync')}
          {(pending > 0 || failed > 0) && (
            <span className="ml-1 font-semibold">
              {pending > 0 && <>{t('offline.banner.pending', { count: pending })}</>}
              {pending > 0 && failed > 0 && <> · </>}
              {failed > 0 && <>{t('offline.banner.failed', { count: failed })}</>}
            </span>
          )}
        </p>
        <StoragePausedNote />
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-50"
        >
          <RefreshCw className="h-3 w-3" />
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** #6: show a one-line note when prefetch paused due to the storage budget. */
function StoragePausedNote() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    canPrefetch().then((ok) => setPaused(!ok)).catch(() => {});
  }, []);
  if (!paused) return null;
  return (
    <p className="mt-1 text-[11px] text-amber-700/80">
      {t('offline.banner.storagePaused')}
    </p>
  );
}
