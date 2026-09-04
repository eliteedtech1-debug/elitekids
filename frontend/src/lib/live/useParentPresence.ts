/**
 * useParentPresence — background WebSocket that tracks which children are
 * online in the parent's live room. Shows toast alerts on connect/disconnect.
 *
 * Uses EliteLive (same WS as /parent/live) but only for presence — no audio.
 * The server resolves the parent's room from the JWT (parents.user_id → phone).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { EliteLive, type LivePeer } from './audio';
import { STORAGE_KEYS } from '@/lib/utils/constants';

function decodeToken(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function useParentPresence() {
  const [onlineAdms, setOnlineAdms] = useState<Set<string>>(new Set());
  const prevAdmsRef = useRef<Set<string>>(new Set());
  const liveRef = useRef<EliteLive | null>(null);

  const handlePresence = useCallback((peers: LivePeer[]) => {
    const students = peers.filter((p) => p.role === 'student');
    const currentAdms = new Set(students.map((s) => s.adm));

    // Toast alerts for changes (skip first presence — no diff yet)
    const prev = prevAdmsRef.current;
    if (prev.size > 0 || currentAdms.size > 0) {
      for (const s of students) {
        if (!prev.has(s.adm)) {
          toast(`${s.name} is now online`, { icon: '🟢', duration: 3000 });
        }
      }
      for (const adm of prev) {
        if (!currentAdms.has(adm)) {
          toast('A child went offline', { icon: '🔴', duration: 3000 });
        }
      }
    }
    prevAdmsRef.current = currentAdms;
    setOnlineAdms(currentAdms);
  }, []);

  useEffect(() => {
    // Use parent-specific token so parent + student can coexist in same browser
    const token = localStorage.getItem(STORAGE_KEYS.PARENT_TOKEN) || localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) return;

    const decoded = decodeToken(token);
    if (!decoded) return;
    if (String(decoded.user_type || '').toLowerCase() !== 'parent') return;

    const live = new EliteLive({});
    liveRef.current = live;
    live.connect(token);

    // Subscribe to presence via the liveEvents bus (EliteLive emits there)
    import('./events').then(({ liveEvents }) => {
      const unsub = liveEvents.on('presence', (msg: any) => {
        const peers = (msg?.online as LivePeer[]) || [];
        handlePresence(peers);
      });
      // Store unsub for cleanup
      (live as any).__presenceUnsub = unsub;
    });

    return () => {
      const unsub = (live as any).__presenceUnsub;
      if (unsub) unsub();
      live.disconnect();
      liveRef.current = null;
    };
  }, [handlePresence]);

  return { onlineAdms, isOnline: (adm: string) => onlineAdms.has(adm) };
}
