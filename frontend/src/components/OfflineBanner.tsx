import { WifiOff, Download, RefreshCw } from 'lucide-react';

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
  onRetry?: () => void;
  className?: string;
}

export default function OfflineBanner({
  hasQueuedProgress = false,
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
        <p className="font-semibold">You're offline</p>
        <p className="text-xs text-amber-600">
          {hasQueuedProgress
            ? 'Your progress is saved and will sync when you reconnect.'
            : 'Playing from cache. Your progress will sync when you reconnect.'}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-600 transition hover:bg-amber-50"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}
