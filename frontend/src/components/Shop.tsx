import { useEffect, useState, useCallback } from 'react';
import { Coins, Check, Sparkles, ShoppingBag, X } from 'lucide-react';
import { playTap, playScore } from '@/lib/game/sound-effects';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { ShopCategory, ShopItem } from '@/lib/types/adaptive';

interface ShopProps {
  open: boolean;
  onClose: () => void;
  onBalanceChange?: (newBalance: number) => void;
}

export default function Shop({ open, onClose, onBalanceChange }: ShopProps) {
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const loadShop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get(ENDPOINTS.ECONOMY.SHOP);
      const payload = data?.data || {};
      setCategories(payload.categories || []);
      setBalance(Number(payload.balance || 0));
      if (!activeCategory && payload.categories?.length) {
        setActiveCategory(payload.categories[0].id);
      }
    } catch {
      setError('Could not load the shop.');
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (open) loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeCat = categories.find((c) => c.id === activeCategory) || categories[0];

  const handleBuy = async (item: ShopItem) => {
    if (item.owned || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post(ENDPOINTS.ECONOMY.SHOP_BUY, { item_id: item.id });
      const newBalance = data?.data?.new_balance;
      if (typeof newBalance === 'number') {
        setBalance(newBalance);
        onBalanceChange?.(newBalance);
        playScore();
      }
      await loadShop();
    } catch (e: any) {
      setError(e?.message || 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEquip = async (item: ShopItem) => {
    if (!item.owned || item.equipped || busy) return;
    setBusy(true);
    try {
      await apiClient.post(ENDPOINTS.ECONOMY.SHOP_EQUIP, { item_id: item.id });
      playTap();
      await loadShop();
    } catch (e: any) {
      setError(e?.message || 'Could not equip item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-violet-300" />
            <h2 className="text-lg font-bold text-white">Companion Shop</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-yellow-400/15 px-3 py-1 text-sm font-bold text-yellow-300">
              <Coins className="h-4 w-4" /> {balance.toLocaleString()}
            </div>
            <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-white/60 hover:bg-white/20" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300">{error}</div>}

        {/* Category tabs */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-2.5">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                  activeCategory === c.id
                    ? 'bg-violet-400 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-white/50">Loading shop…</div>
          ) : !activeCat || !activeCat.items?.length ? (
            <div className="py-10 text-center text-white/50">No items in this category yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activeCat.items.map((item) => (
                <div
                  key={item.id}
                  className={`relative flex flex-col rounded-2xl border p-3 ${
                    item.equipped
                      ? 'border-violet-400/50 bg-violet-400/10'
                      : item.owned
                      ? 'border-white/10 bg-white/5'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  {item.equipped && (
                    <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-violet-400 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      <Check className="h-3 w-3" /> Equipped
                    </span>
                  )}
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-3xl">
                    {item.preview_url ? (
                      <img src={item.preview_url} alt={item.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <Sparkles className="h-6 w-6 text-violet-300" />
                    )}
                  </div>
                  <div className="mt-2 text-sm font-bold text-white">{item.name}</div>
                  <div className="line-clamp-2 text-xs text-white/50">{item.description}</div>
                  <div className="mt-2">
                    {item.owned ? (
                      <button
                        onClick={() => handleEquip(item)}
                        disabled={item.equipped || busy}
                        className={`w-full rounded-xl py-1.5 text-xs font-bold transition ${
                          item.equipped
                            ? 'bg-white/10 text-white/40'
                            : 'bg-violet-400 text-white hover:brightness-110'
                        }`}
                      >
                        {item.equipped ? 'Equipped' : 'Equip'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBuy(item)}
                        disabled={balance < item.cost || busy}
                        className={`flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-bold transition ${
                          balance < item.cost
                            ? 'bg-white/10 text-white/40'
                            : 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white hover:brightness-110'
                        }`}
                      >
                        <Coins className="h-3.5 w-3.5" /> {item.cost.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
