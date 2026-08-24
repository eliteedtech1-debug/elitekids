import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Radio } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { EliteLive } from '@/lib/live/audio';

/**
 * E3f — student-side live audio strip: shows when the teacher is broadcasting;
 * lights up the reply mic only while the teacher has granted this child the floor.
 */
export default function StudentLiveBar() {
  const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const [liveOn, setLiveOn] = useState(false);
  const [floored, setFloored] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [denied, setDenied] = useState(false);
  const liveRef = useRef<EliteLive | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token || !('WebSocket' in window)) return;
    const live = new EliteLive({
      onStatus: setStatus,
      onTeacherLive: setLiveOn,
      onYouFloor: (on) => {
        setFloored(on);
        if (!on && liveRef.current?.isSpeaking) {
          liveRef.current.stopSpeaking();
          setSpeaking(false);
        }
      },
    });
    liveRef.current = live;
    live.connect(token);
    return () => live.disconnect();
  }, []);

  if (status !== 'live' || (!liveOn && !floored)) return null;

  const toggleSpeak = async () => {
    const live = liveRef.current;
    if (!live) return;
    if (speaking) {
      live.stopSpeaking();
      setSpeaking(false);
    } else {
      const ok = await live.startSpeaking();
      if (!ok) setDenied(true);
      else setSpeaking(true);
    }
  };

  return (
    <div className="mb-4 space-y-2">
      {liveOn && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 px-4 py-3 shadow-lg animate-game-slide-up">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <Radio className="h-4 w-4 text-white" />
          <p className="flex-1 text-sm font-extrabold text-white">LIVE — Teacher is speaking to your class!</p>
        </div>
      )}
      {floored && (
        <button
          onClick={toggleSpeak}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold shadow-lg transition-all active:scale-[0.99] ${
            speaking ? 'bg-red-600 text-white' : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {speaking ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {speaking ? '🔴 You are speaking — tap when done' : '🎤 Teacher unmuted you! Tap to reply'}
        </button>
      )}
      {denied && (
        <p className="text-center text-xs font-semibold text-red-500">
          Microphone blocked — allow microphone access in your browser settings.
        </p>
      )}
    </div>
  );
}
