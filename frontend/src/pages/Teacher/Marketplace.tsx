import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Store, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminNav from '@/components/AdminNav';
import ListingCard, { type MarketplaceListing } from '@/components/ListingCard';
import ListingDetail from '@/components/ListingDetail';
import PublisherDashboard from '@/components/PublisherDashboard';
import ReviewForm from '@/components/ReviewForm';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export default function Marketplace() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<MarketplaceListing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPublisher, setShowPublisher] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewListing, setReviewListing] = useState<MarketplaceListing | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', subject_code: '', age_band: 'KG1', nerdc_code: '', price_ngn: '0', is_free: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.MARKETPLACE.LISTINGS, { params: { search: search || undefined, category: category || undefined, per_page: 50 } });
      setListings(res.data?.data || []);
    } catch { toast.error('Could not load the marketplace.'); }
    finally { setLoading(false); }
  }, [search, category]);
  useEffect(() => { load(); }, [load]);

  const purchase = async (listing: MarketplaceListing) => {
    setBusyId(listing.id);
    try {
      const res = await apiClient.post(ENDPOINTS.MARKETPLACE.INITIATE, { listing_id: listing.id, gateway: 'paystack' });
      const data = res.data || {};
      if (data.free || data.data?.free) { toast.success('Resource claimed.'); return; }
      const checkout = data.checkout_url || data.data?.checkout_url;
      if (checkout) window.location.assign(checkout);
      else toast.error(data.message || 'Payment could not be started.');
    } catch (err: any) { toast.error(err?.message || 'Could not start purchase.'); }
    finally { setBusyId(null); }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    try {
      await apiClient.post(ENDPOINTS.MARKETPLACE.LISTINGS, { ...form, title: form.title.trim(), price_ngn: Number(form.price_ngn) || 0, is_free: form.is_free ? 1 : 0 });
      toast.success('Draft listing created.'); setShowCreate(false); setForm({ title: '', description: '', category: '', subject_code: '', age_band: 'KG1', nerdc_code: '', price_ngn: '0', is_free: true });
    } catch (err: any) { toast.error(err?.message || 'Could not create listing.'); }
  };

  const submitReview = async (rating: number, comment: string) => {
    if (!reviewListing) return;
    await apiClient.post(ENDPOINTS.MARKETPLACE.REVIEW, { listing_id: reviewListing.id, rating, comment });
    toast.success('Review saved.'); setReviewListing(null);
  };

  return (
    <div className="min-h-screen bg-[#E7EEF6]"><AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800"><Store className="h-6 w-6 text-[#0F4D92]" /> Content Marketplace</h1><p className="mt-1 text-sm text-gray-500">Discover curriculum resources from the EliteKids teaching community.</p></div><div className="flex gap-2"><button onClick={() => setShowPublisher((v) => !v)} className="rounded-xl border border-[#0F4D92]/20 bg-white px-3 py-2 text-xs font-bold text-[#0F4D92]">{showPublisher ? 'Browse resources' : 'Publisher workspace'}</button><button onClick={() => setShowCreate(true)} className="rounded-xl bg-[#0F4D92] px-3 py-2 text-xs font-bold text-white">Publish resource</button></div></div>
        {showPublisher ? <PublisherDashboard onCreate={() => setShowCreate(true)} /> : <>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search resources, subjects, or categories" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-[#0F4D92] focus:outline-none" /></div><select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"><option value="">All categories</option><option value="Numbers">Numbers</option><option value="Literacy">Literacy</option><option value="Shapes">Shapes</option><option value="Science">Science</option></select></div>
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" /></div> : listings.length === 0 ? <div className="rounded-2xl bg-white p-12 text-center text-sm text-gray-400">No published resources match your search.</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} busy={busyId === listing.id} onOpen={setSelected} onPurchase={purchase} />)}</div>}
          <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">Payments are processed through the configured gateway. Publisher payout and revenue-share rules are pending product-owner approval.</p>
        </>}
      </main>
      <ListingDetail listing={selected} onClose={() => setSelected(null)} onPurchase={purchase} busy={selected ? busyId === selected.id : false} />
      {selected && <button onClick={() => { setReviewListing(selected); setSelected(null); }} className="fixed bottom-5 right-5 z-40 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg">Review this resource</button>}
      {reviewListing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md"><button onClick={() => setReviewListing(null)} className="mb-2 ml-auto block rounded-full bg-white p-2 text-gray-500"><X className="h-4 w-4" /></button><ReviewForm onSubmit={submitReview} /></div></div>}
      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={create} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold text-gray-800">Publish a resource draft</h2><button type="button" onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-gray-400" /></button></div><div className="grid gap-3 sm:grid-cols-2"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" /><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="min-h-24 rounded-xl border px-3 py-2 text-sm sm:col-span-2" /><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="rounded-xl border px-3 py-2 text-sm" /><input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} placeholder="Subject code" className="rounded-xl border px-3 py-2 text-sm" /><select value={form.age_band} onChange={(e) => setForm({ ...form, age_band: e.target.value })} className="rounded-xl border px-3 py-2 text-sm"><option>Creche</option><option>Nursery</option><option>KG1</option><option>KG2</option><option>Primary</option></select><input type="number" min="0" value={form.price_ngn} disabled={form.is_free} onChange={(e) => setForm({ ...form, price_ngn: e.target.value })} placeholder="Price NGN" className="rounded-xl border px-3 py-2 text-sm disabled:bg-gray-100" /><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.is_free} onChange={(e) => setForm({ ...form, is_free: e.target.checked })} /> Free resource</label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-bold text-white">Save draft</button></div></form></div>}
    </div>
  );
}
