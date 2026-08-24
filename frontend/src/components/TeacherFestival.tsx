import { useCallback, useEffect, useState } from 'react';
import { Calendar, Swords, Loader2, Check, Crown, Shield, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';

interface Guardian {
  slug: string;
  name: string;
  title: string;
  emoji: string;
  subject: string;
  base_hp: number;
  status: 'defeated' | 'active' | 'upcoming';
  hp: number;
  max_hp: number;
}

interface FestivalData {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  guardians: Guardian[];
  total_defeated: number;
  total_guardians: number;
  all_defeated: boolean;
  mega_badge_earned: boolean;
  current_guardian: Guardian | null;
}

export default function TeacherFestival() {
  const [festival, setFestival] = useState<FestivalData | null>(null);
  const [history, setHistory] = useState<{ id: string; title: string; status: string; completed_count: number; total_guardians: number; starts_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: 'Festival of Guardians', class_code: '' });

  const load = useCallback(async () => {
    try {
      const active = await apiClient.get('/kids/festival/active');
      setFestival(active.data?.data || null);

      const hist = await apiClient.get('/kids/festival/history');
      setHistory(hist.data?.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.class_code.trim()) return toast.error('Enter a class code');
    setCreating(true);
    try {
      const res = await apiClient.post('/kids/festival/create', {
        class_code: form.class_code.trim(),
        title: form.title.trim() || 'Festival of Guardians',
      });
      toast.success(res.data?.data?.message || 'Festival started! ⚔️');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-gray-800">
        <Swords className="h-6 w-6 text-orange-500" /> Festival of Guardians
      </h1>
      <p className="mb-5 text-sm text-gray-500">
        Term-end sequential boss fights. Class defeats 6 guardians → earns the 🌩️ Guardian of the Storm mega badge!
      </p>

      {/* Active Festival */}
      {festival ? (
        <div className="mb-6">
          <div className="mb-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-gray-800">{festival.title}</h2>
                <span className="text-xs text-gray-500">
                  {festival.total_defeated}/{festival.total_guardians} guardians defeated
                </span>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${festival.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {festival.status === 'active' ? '⚔️ Active' : '✅ Complete'}
              </span>
            </div>
          </div>

          {/* Guardian Progress */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {festival.guardians.map((g) => (
              <div
                key={g.slug}
                className={`rounded-xl p-3 text-center transition-all ${
                  g.status === 'defeated'
                    ? 'bg-green-50 border border-green-200'
                    : g.status === 'active'
                    ? 'bg-amber-50 border-2 border-amber-400 shadow-md animate-pulse'
                    : 'bg-gray-50 border border-gray-200 opacity-60'
                }`}
              >
                <div className="text-3xl">{g.emoji}</div>
                <div className="mt-1 text-xs font-extrabold text-gray-700">{g.name}</div>
                <div className="text-[10px] text-gray-400">{g.subject}</div>
                {g.status === 'defeated' ? (
                  <div className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-600">
                    <Check className="h-2.5 w-2.5" /> Defeated
                  </div>
                ) : g.status === 'active' ? (
                  <div className="mt-1">
                    <div className="mx-auto h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-amber-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all"
                        style={{ width: `${(g.hp / g.max_hp) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-amber-600">{g.hp}/{g.max_hp} HP</span>
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] font-semibold text-gray-400">Upcoming</div>
                )}
              </div>
            ))}
          </div>

          {festival.all_defeated && (
            <div className="mt-4 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-600 p-6 text-center text-white shadow-lg">
              <Crown className="mx-auto mb-2 h-8 w-8" />
              <h3 className="text-lg font-extrabold">🌩️ Festival Complete!</h3>
              <p className="mt-1 text-sm opacity-90">The class earned the Guardian of the Storm mega badge!</p>
            </div>
          )}
        </div>
      ) : (
        /* Create Form */
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-extrabold text-gray-700">Start a Festival</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-600">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Festival of Guardians"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Class Code
              <input
                value={form.class_code}
                onChange={(e) => setForm({ ...form, class_code: e.target.value })}
                placeholder="CLS0610"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            onClick={create}
            disabled={creating}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-5 py-2.5 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Launch Festival
          </button>
          <p className="mt-2 text-[11px] text-gray-400">Class fights 6 guardians sequentially. Each guardian requires collective damage from all students playing.</p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-400">Past Festivals</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
                <div>
                  <span className="font-bold text-gray-700">{h.title}</span>
                  <span className="ml-2 text-xs text-gray-400">{new Date(h.starts_at).toLocaleDateString()}</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${h.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                  {h.completed_count}/{h.total_guardians} {h.status === 'completed' ? '✅' : '⚔️'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
