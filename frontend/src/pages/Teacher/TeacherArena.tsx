import { useCallback, useEffect, useState } from 'react';
import { Swords, Loader2, RefreshCw, Flag, Trophy, Users, PlusCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import AdminNav from '@/components/AdminNav';
import TeacherBossRaid from '@/components/TeacherBossRaid';
import TeacherFestival from '@/components/TeacherFestival';

interface Comp {
  id: string;
  title: string;
  class_code: string;
  comp_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  team_a_name: string | null;
  team_b_name: string | null;
  participants: number;
  team_a_pts?: number;
  team_b_pts?: number;
}

export default function TeacherArena() {
  const [comps, setComps] = useState<Comp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', class_code: '', comp_type: 'tug', hours: 48 });

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.ARENA.LIST);
      setComps(res.data?.data || []);
    } catch {
      toast.error('Could not load competitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.class_code.trim()) return toast.error('Class code is required');
    setCreating(true);
    try {
      await apiClient.post(ENDPOINTS.ARENA.CREATE, {
        title: form.title.trim() || undefined,
        class_code: form.class_code.trim(),
        comp_type: form.comp_type,
        hours: Number(form.hours) || 48,
      });
      toast.success('Competition started! 🎉');
      setForm({ title: '', class_code: form.class_code, comp_type: form.comp_type, hours: 48 });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to start';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const end = async (id: string) => {
    try {
      await apiClient.post(ENDPOINTS.ARENA.END(id));
      toast.success('Competition ended');
      load();
    } catch {
      toast.error('Could not end competition');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-gray-800">
          <Swords className="h-6 w-6 text-orange-500" /> Class Arena
        </h1>
        <p className="mb-5 text-sm text-gray-500">
          Start intra-class battles — Tug-of-War (team rope) or Trophy Race (individual 1st/2nd/3rd). Only Practice &amp; Test games score.
        </p>

        {/* Create form */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 text-xs font-bold text-gray-600 sm:col-span-1">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Friday Battle!"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Class code
              <input
                value={form.class_code}
                onChange={(e) => setForm({ ...form, class_code: e.target.value })}
                placeholder="CLS0610"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-bold text-gray-600">
              Format
              <select
                value={form.comp_type}
                onChange={(e) => setForm({ ...form, comp_type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
              >
                <option value="tug">⚔️ Tug-of-War (teams)</option>
                <option value="trophy">🏆 Trophy Race (solo)</option>
              </select>
            </label>
            <label className="text-xs font-bold text-gray-600">
              Hours
              <input
                type="number"
                min={1}
                max={336}
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>
          <button
            onClick={create}
            disabled={creating}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2.5 text-sm font-extrabold text-white shadow hover:bg-[#0D3F7A] disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
            Start Competition
          </button>
        </div>

        {/* List */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-400">Competitions</h2>
          <button onClick={load} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4D92]">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
        ) : comps.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-400">No competitions yet — start one above!</p>
        ) : (
          <div className="mt-3 space-y-3">
            {comps.map((c) => (
              <div key={c.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${c.status === 'active' ? 'border-green-200' : 'border-gray-100 opacity-70'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="mr-2">{c.comp_type === 'tug' ? '⚔️' : '🏆'}</span>
                    <span className="font-extrabold text-gray-800">{c.title}</span>
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{c.class_code}</span>
                    {c.status === 'active' && <span className="ml-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-green-500" />}
                  </div>
                  {c.status === 'active' && (
                    <button onClick={() => end(c.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                      <Flag className="h-3.5 w-3.5" /> End now
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.participants} played</span>
                  {c.comp_type === 'tug' ? (
                    <span className="font-semibold">
                      {c.team_a_name}: <b className="text-purple-600">{c.team_a_pts ?? 0}</b> — {c.team_b_name}: <b className="text-green-600">{c.team_b_pts ?? 0}</b>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-amber-500" />live ranking in student view</span>
                  )}
                  <span>ends {new Date(c.ends_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Boss Raids Section */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Swords className="h-5 w-5 text-red-500" />
          Boss Raids
        </h2>
        <TeacherBossRaid />
      </div>
    </div>
  );
}
