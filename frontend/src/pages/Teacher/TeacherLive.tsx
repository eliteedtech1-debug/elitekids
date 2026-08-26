import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, Radio, ArrowLeft, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';
import AdminNav from '@/components/AdminNav';
import { EliteLive, type LivePeer } from '@/lib/live/audio';

/**
 * E3f — teacher console for KidsLive: broadcast audio to a class in real time,
 * hand individual students the mic for replies (walkie-talkie style).
 */
export default function TeacherLive() {
  const [classCode, setClassCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const liveRef = useRef<EliteLive | null>(null);

  useEffect(() => () => liveRef.current?.disconnect(), []);

  const join = async () => {
    if (!classCode.trim()) return toast.error(t('teacher.live.enterCode'));
    setConnecting(true);
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
      const live = new EliteLive({
        onStatus: setStatus,
        onPresence: setPeers,
      });
      liveRef.current = live;
      live.connect(token, `class=${encodeURIComponent(classCode.trim().toUpperCase())}`);
      setTimeout(() => {
        if (live.status === 'live') {
          setJoined(true);
          toast.success(t('teacher.live.connected'));
        } else if (live.status === 'error') {
          toast.error(t('teacher.live.unreachable'));
        }
        setConnecting(false);
      }, 1500);
    } catch {
      toast.error(t('teacher.live.connectFailed'));
      setConnecting(false);
    }
  };

  const leave = () => {
    liveRef.current?.disconnect();
    liveRef.current = null;
    setJoined(false);
    setSpeaking(false);
    setPeers([]);
    setStatus('off');
  };

  const toggleBroadcast = async () => {
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
        toast.success(t('teacher.live.liveToast'));
      }
    }
  };

  const floor = (adm: string, on: boolean) => {
    liveRef.current?.giveFloor(adm, on);
  };

  const students = peers.filter((p) => p.role === 'student');

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Radio className="h-6 w-6 text-red-500" /> {t('teacher.live.title')}
          </h1>
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0F4D92]">
            <ArrowLeft className="h-4 w-4" /> {t('teacher.live.dashboard')}
          </Link>
        </div>
        <p className="mb-5 text-sm text-gray-500">{t('teacher.live.subtitle')}</p>

        {!joined ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="text-xs font-bold text-gray-600">
              {t('teacher.live.classCode')}
              <input
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder={t('teacher.live.codePlaceholder')}
                className="mt-1 w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal uppercase"
              />
            </label>
            <button
              onClick={join}
              disabled={connecting}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-extrabold text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              {t('teacher.live.openChannel')}
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
                  {speaking ? t('teacher.live.onAir') : t('teacher.live.startBroadcast')}
                </button>
                <button onClick={leave} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                  {t('teacher.live.closeChannel')}
                </button>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
                  <Users className="h-4 w-4" /> {t('teacher.live.onlineCount', { count: students.length })}
                  {status === 'live' && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />}
                </span>
              </div>
              {micDenied && (
                <p className="mt-3 text-xs font-semibold text-red-500">{t('teacher.live.micDenied')}</p>
              )}
            </div>

            {/* Roster / floors */}
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-gray-400">{t('teacher.live.studentsOnline')}</h2>
            {students.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
                {t('teacher.live.noStudents')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {students.map((s) => (
                  <div key={s.adm} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm ${s.floor ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-100'}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.floor ? 'bg-green-500' : 'bg-gray-200'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{s.name}</span>
                    {s.floor ? (
                      <button onClick={() => floor(s.adm, false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                        {t('teacher.live.takeMic')}
                      </button>
                    ) : (
                      <button onClick={() => floor(s.adm, true)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-green-700">
                        {t('teacher.live.giveMic')}
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
