import { useCallback, useEffect, useState } from 'react';
import { Archive, Loader2, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { MarketplaceListing } from './ListingCard';

interface PublisherDashboardProps { onCreate: () => void; }

export default function PublisherDashboard({ onCreate }: PublisherDashboardProps) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.MARKETPLACE.LISTINGS, { params: { status: 'draft', per_page: 50 } });
      setListings(res.data?.data || []);
    } catch { toast.error('Could not load your marketplace drafts.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const publish = async (id: string) => {
    try { await apiClient.patch(ENDPOINTS.MARKETPLACE.LISTING(id), { status: 'published' }); toast.success('Listing published.'); await load(); }
    catch { toast.error('Could not publish listing.'); }
  };
  const archive = async (id: string) => {
    try { await apiClient.delete(ENDPOINTS.MARKETPLACE.LISTING(id)); toast.success('Listing archived.'); await load(); }
    catch { toast.error('Could not archive listing.'); }
  };
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="font-extrabold text-gray-800">Publisher workspace</h2><p className="text-xs text-gray-500">Create and review your marketplace drafts.</p></div><div className="flex gap-2"><button onClick={load} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button><button onClick={onCreate} className="inline-flex items-center gap-1 rounded-xl bg-[#0F4D92] px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> New listing</button></div></div>
      {loading ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-[#0F4D92]" /> : listings.length === 0 ? <p className="py-5 text-center text-xs text-gray-400">No drafts yet.</p> : <div className="space-y-2">{listings.map((listing) => <div key={listing.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-800">{listing.title}</p><p className="text-xs text-gray-400">{listing.status || 'draft'} · {listing.category || 'Uncategorised'}</p></div><div className="flex gap-1.5"><button onClick={() => publish(listing.id)} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-green-700">Publish</button><button onClick={() => archive(listing.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Archive className="h-3.5 w-3.5" /> Archive</button></div></div>)}</div>}
    </section>
  );
}
