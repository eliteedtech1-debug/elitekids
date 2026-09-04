import { BookOpen, Star, Tag } from 'lucide-react';

export interface MarketplaceListing {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  subject_code?: string | null;
  age_band?: string | null;
  nerdc_code?: string | null;
  price_ngn?: number;
  is_free?: number | boolean;
  status?: string;
  preview_url?: string | null;
  rating?: number;
  review_count?: number;
  publisher_id?: string;
}

interface ListingCardProps {
  listing: MarketplaceListing;
  onOpen: (listing: MarketplaceListing) => void;
  onPurchase: (listing: MarketplaceListing) => void;
  busy?: boolean;
}

const naira = (value: number) => `₦${Math.max(0, Number(value) || 0).toLocaleString('en-NG')}`;

export default function ListingCard({ listing, onOpen, onPurchase, busy = false }: ListingCardProps) {
  const free = Boolean(Number(listing.is_free));
  return (
    <article className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button onClick={() => onOpen(listing)} className="text-left" aria-label={`Open ${listing.title}`}>
        <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 to-teal-50">
          {listing.preview_url ? (
            <img src={listing.preview_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <BookOpen className="h-10 w-10 text-[#0F4D92]" />
          )}
        </div>
        <h3 className="line-clamp-2 text-sm font-extrabold text-gray-800">{listing.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-8 text-xs text-gray-500">{listing.description || 'Curriculum-aligned learning resource.'}</p>
      </button>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold text-gray-500">
        {listing.category && <span className="rounded-full bg-gray-100 px-2 py-1">{listing.category}</span>}
        {listing.age_band && <span className="rounded-full bg-purple-50 px-2 py-1 text-purple-700">{listing.age_band}</span>}
        {listing.nerdc_code && <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{listing.nerdc_code}</span>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div>
          <p className="text-sm font-extrabold text-[#0F4D92]">{free ? 'Free' : naira(Number(listing.price_ngn))}</p>
          <p className="flex items-center gap-1 text-[11px] text-gray-400">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(listing.rating || 0).toFixed(1)} ({listing.review_count || 0})
          </p>
        </div>
        <button
          onClick={() => onPurchase(listing)}
          disabled={busy}
          className="rounded-xl bg-[#0F4D92] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0b3d76] disabled:opacity-50"
        >
          {busy ? 'Working…' : free ? 'Claim free' : 'Get resource'}
        </button>
      </div>
      <span className="mt-2 flex items-center gap-1 text-[10px] text-gray-400"><Tag className="h-3 w-3" /> Teacher-created resource</span>
    </article>
  );
}
