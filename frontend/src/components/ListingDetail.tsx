import { X, Star, ExternalLink } from 'lucide-react';
import type { MarketplaceListing } from './ListingCard';

interface ListingDetailProps {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onPurchase: (listing: MarketplaceListing) => void;
  busy?: boolean;
}

export default function ListingDetail({ listing, onClose, onPurchase, busy = false }: ListingDetailProps) {
  if (!listing) return null;
  const free = Boolean(Number(listing.is_free));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={listing.title}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F4D92]">Marketplace resource</p>
            <h2 className="mt-1 text-xl font-extrabold text-gray-800">{listing.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {listing.preview_url && (
          <a href={listing.preview_url} target="_blank" rel="noreferrer" className="mb-4 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><ExternalLink className="h-4 w-4" /> Open preview</a>
        )}
        <p className="text-sm leading-6 text-gray-600">{listing.description || 'No description provided.'}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {[
            ['Category', listing.category],
            ['Subject', listing.subject_code],
            ['Age band', listing.age_band],
            ['NERDC', listing.nerdc_code],
          ].map(([label, value]) => value && <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-gray-400">{label}</p><p className="mt-1 font-bold text-gray-700">{value}</p></div>)}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <div><p className="text-lg font-extrabold text-[#0F4D92]">{free ? 'Free' : `₦${Number(listing.price_ngn || 0).toLocaleString('en-NG')}`}</p><p className="flex items-center gap-1 text-xs text-gray-400"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(listing.rating || 0).toFixed(1)} from {listing.review_count || 0} reviews</p></div>
          <button onClick={() => onPurchase(listing)} disabled={busy} className="rounded-xl bg-[#0F4D92] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0b3d76] disabled:opacity-50">{busy ? 'Working…' : free ? 'Claim free' : 'Continue to payment'}</button>
        </div>
      </div>
    </div>
  );
}
