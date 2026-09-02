/**
 * StudentLiveBar — Persistent live-audio bar for students.
 *
 * Connects to the class WebSocket channel on mount.
 * Shows teacher-speaking indicator and mic-reply button when granted floor.
 * Embeds at the top of StudentHome (or any student page).
 */

import { useEffect, useRef, useState } from 'react';
import { Radio, Mic, MicOff, Volume2 } from 'lucide-react';
import { getLiveConnection } from '@/lib/live/connection';
import { liveEvents } from '@/lib/live/events';
import { t } from '@/lib/i18n';

export default function StudentLiveBar() {
  const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const [teacherLive, setTeacherLive] = useState(false);
  const [hasFloor, setHasFloor] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    const live = getLiveConnection();
    if (!live) return;

    // Poll live state for UI updates
    const stateInterval = setInterval(() => {
      setStatus(live.status);
      setHasFloor(live.hasFloor);
      setSpeaking(live.isSpeaking);
    }, 300);

    // Subscribe to floor events from the event bus
    const unsubFloor = liveEvents.on('you-floor', (d: any) => {
      setHasFloor(!!d.on);
      if (!d.on) {
        setSpeaking(false);
        setMicDenied(false);
      }
    });

    // Subscribe to teacher live on/off events
    const unsubLive = liveEvents.on('teacher-live', (d: any) => {
      setTeacherLive(!!d.on);
    });

    // Track online count from presence events
    const unsubPresence = liveEvents.on('presence', (d: any) => {
      const peers = d?.online;
      if (Array.isArray(peers)) setOnlineCount(peers.length);
    });

    return () => {
      clearInterval(stateInterval);
      unsubFloor();
      unsubLive();
      unsubPresence();
    };
  }, []);

  // Don't render if not connected or no live teacher
  if (status !== 'live') return null;

  return (
    <div className="sticky top-0 z-40">
      {/* Teacher is speaking — prominent bar */}
      {teacherLive && !hasFloor && (
        <div className="flex items-center gap-2 bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-4 py-2.5 text-white shadow-lg animate-game-pulse">
          <Volume2 className="h-4 w-4 flex-shrink-0 animate-bounce" />
          <span className="text-xs font-bold tracking-wide">
            {t('student.liveBar.teacherSpeaking')}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Radio className="h-3 w-3 animate-pulse" />
            <span className="text-[10px] font-medium opacity-80">{onlineCount}</span>
          </div>
        </div>
      )}

      {/* You have the floor — reply mode */}
      {hasFloor && (
        <div className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2.5 text-white shadow-lg">
          {speaking ? (
            <>
              <Mic className="h-4 w-4 animate-pulse" />
              <span className="text-xs font-bold">{t('student.liveBar.youSpeaking')}</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span className="text-xs font-bold">{t('student.liveBar.youHaveFloor')}</span>
            </>
          )}
        </div>
      )}

      {/* Mic denied warning */}
      {micDenied && (
        <div className="flex items-center gap-2 bg-red-500 px-4 py-2 text-white text-xs font-medium">
          <MicOff className="h-3.5 w-3.5" />
          <span>{t('student.liveBar.micDenied')}</span>
        </div>
      )}
    </div>
  );
}
