import { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudOff } from 'lucide-react';
import { offlineSync } from '@/lib/offline/sync';
import { offlineDB, STORES } from '@/lib/offline/db';
import { t } from '@/lib/i18n';

/**
 * Offline indicator banner — shows connection status and pending sync count.
 *
 * Features:
 *   - Green "Online" badge when connected
 *   - Amber "Offline — X pending" banner when disconnected
 *   - Manual "Sync now" button when back online with pending items
 *   - Auto-hides after successful sync
 *
 * Props:
 *   - compact: show as a small dot instead of a full banner (default: false)
 *   - className: additional CSS classes
 */
interface OfflineIndicatorProps {
  compact?: boolean;
  className?: string;
}

export default function OfflineIndicator({ compact = false, className = '' }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const updatePendingCount = useCallback(async () => {
    const count = await offlineDB.syncQueueSize();
    setPendingCount(count);
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      updatePendingCount();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updatePendingCount();

    // Poll pending count every 10 seconds
    const interval = setInterval(updatePendingCount, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [updatePendingCount]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await offlineSync.drainNow();
      await updatePendingCount();
    } finally {
      setSyncing(false);
    }
  }, [updatePendingCount]);

  // Compact mode — just a dot
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <div
          className={`h-2.5 w-2.5 rounded-full transition-colors ${
            isOnline ? 'bg-green-400' : 'bg-amber-400 animate-pulse'
          }`}
        />
        {!isOnline && pendingCount > 0 && (
          <span className="text-[10px] font-semibold text-amber-600">{pendingCount}</span>
        )}
      </div>
    );
  }

  // Full banner mode
  if (isOnline && pendingCount === 0) {
    // Only show briefly after coming back online, then hide
    return null;
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
        isOnline
          ? 'border border-green-200 bg-green-50 text-green-700'
          : 'border border-amber-200 bg-amber-50 text-amber-700'
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-amber-500 animate-pulse" />
        )}
        <span>
          {isOnline ? (
            pendingCount > 0 ? (
              <>
                <span className="font-semibold">{t('offline.back_online')}</span> — {pendingCount} item{pendingCount !== 1 ? 's' : ''} to sync
              </>
            ) : (
              <span className="text-green-600">Online</span>
            )
          ) : (
            <>
              <span className="font-semibold">{t('ui.offline_badge')}</span>
              {pendingCount > 0 && (
                <> — {pendingCount} item{pendingCount !== 1 ? 's' : ''} saved</>
              )}
            </>
          )}
        </span>
      </div>

      {isOnline && pendingCount > 0 && (
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? t('ui.loading') : 'Sync now'}
        </button>
      )}

      {!isOnline && (
        <CloudOff className="h-4 w-4 text-amber-400" />
      )}
    </div>
  );
}
