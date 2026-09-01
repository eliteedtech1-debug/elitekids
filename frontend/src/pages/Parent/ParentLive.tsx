import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, Radio, ArrowLeft, Users, Phone, PhoneOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';
import { EliteLive, type LivePeer } from '@/lib/live/audio';

/**
 * Parent live-control page: real-time audio with your children.
 * Mirrors TeacherLive but does NOT pass class= — server auto-derives
 * rooms from kids_parent_links / parents tables.
 */
export default function ParentLive() {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const liveRef = useRef<EliteLive | null>(null);

  useEffect(() => () => liveRef.current?.disconnect(), []);

  const join = useCallback(async () => {
    setConnecting(true);
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      if (!token) {
        toast.error('Please log in first');
        setConnecting(false);
        return;
      }
      const live = new EliteLive({
        onStatus: setStatus,
        onPresence: setPeers,
      });
      liveRef.current = live;
      // Parent rooms are auto-derived — no class= query param needed
      live.connect(token);
      setTimeout(() => {
        if (live.status === 'live') {
          setJoined(true);
          toast.success('Connected to your children');
        } else if (live.status === 'error') {
          toast.error('Could not connect — try again');
        }
        setConnecting(false);
      }, 1500);
    } catch {
      toast.error('Connection failed');
      setConnecting(false);
    }
  }, []);

  const leave = useCallback(() => {
    liveRef.current?.disconnect();
    liveRef.current = null;
    setJoined(false);
    setSpeaking(false);
    setPeers([]);
    setStatus('off');
  }, []);

  const toggleBroadcast = useCallback(async () => {
    const live = liveRef.current;
    if (!live) return;
    if (speaking) {
      live.stopSpeaking();
      setSpeaking(false);
    } else {
      const ok = await live.startSpeaking();
      if (!ok) setMicDenied(true);
      else {
        setMicDenied(false);
        setSpeaking(true);
        toast.success('You are live — your child can hear you');
      }
    }
  }, [speaking]);

  const floor = useCallback((adm: string, on: boolean) => {
    liveRef.current?.giveFloor(adm, on);
  }, []);

  const children = peers.filter((p) => p.role === 'student');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Radio className="h-6 w-6 text-red-500" /> {t('parent.live.title')}
          </h1>
          <Link to="/parent" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F4D92]">
            <ArrowLeft className="h-4 w-4" /> {t('parent.dashboard')}
          </Link>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          {t('parent.live.subtitle')}
        </p>

        {!joined ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm text-gray-600">
              {t('parent.live.joinDesc')}
            </p>
            <button
              onClick={join}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-base font-extrabold text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
              {t('parent.live.connect')}
            </button>
          </div>
        ) : (
          <>
            {/* Broadcast control */}
            <div className={`mb-5 rounded-2xl border p-5 shadow-sm ${speaking ? 'border-red-300 bg-red-50' : 'border-green-200 bg-white'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleBroadcast}
                  className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-extrabold text-white shadow transition-all active:scale-[0.99] ${
                    speaking ? 'bg-gray-700 hover:bg-gray-800' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {speaking ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  {speaking ? t('parent.live.onAir') : t('parent.live.startBroadcast')}
                </button>
                <button onClick={leave} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                  <PhoneOff className="mr-1 inline h-4 w-4" /> {t('parent.live.disconnect')}
                </button>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
                  <Users className="h-4 w-4" /> {t('parent.live.onlineChildren', { count: children.length })}
                  {status === 'live' && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />}
                </span>
              </div>
              {micDenied && (
                <p className="mt-3 text-xs font-semibold text-red-500">
                  {t('parent.live.micDenied')}
                </p>
              )}
            </div>

            {/* Children roster */}
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-gray-400">
              {t('parent.live.yourChildren')}
            </h2>
            {children.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
                {t('parent.live.noChildrenOnline')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {children.map((c) => (
                  <div key={c.adm} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm ${c.floor ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-100'}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.floor ? 'bg-green-500' : 'bg-gray-200'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{c.name}</span>
                    {c.floor ? (
                      <button onClick={() => floor(c.adm, false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                        {t('parent.live.mute')}
                      </button>
                    ) : (
                      <button onClick={() => floor(c.adm, true)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-green-700">
                        {t('parent.live.giveMic')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
