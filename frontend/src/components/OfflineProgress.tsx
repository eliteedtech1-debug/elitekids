import { useEffect } from 'react';
import { HardDrive, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useOfflineStore } from '@/lib/offline/store';

export default function OfflineProgress({ compact = false }: { compact?: boolean }) {
  const { isOnline, pendingSyncCount, cachedLessonCount, isSyncing, lastSyncResult, init, triggerSync } = useOfflineStore();
  useEffect(() => { init(); }, [init]);
  if (compact && isOnline && pendingSyncCount === 0) return null;
  return <section className={`rounded-2xl border p-3 ${isOnline ? 'border-green-100 bg-green-50/60' : 'border-amber-100 bg-amber-50/70'}`}><div className="flex items-center gap-2"><span className="rounded-lg bg-white p-1.5">{isOnline ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}</span><div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-gray-700">{isOnline ? 'Online' : 'Offline mode'}</p><p className="text-[11px] text-gray-500"><HardDrive className="mr-1 inline h-3 w-3" />{cachedLessonCount} cached lessons · {pendingSyncCount} pending sync</p></div>{isOnline && pendingSyncCount > 0 && <button onClick={() => triggerSync()} disabled={isSyncing} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} /> Sync</button>}</div>{lastSyncResult && <p className="mt-2 text-[10px] text-gray-500">Last sync: {lastSyncResult.sent} sent, {lastSyncResult.failed} failed.</p>}</section>;
}
