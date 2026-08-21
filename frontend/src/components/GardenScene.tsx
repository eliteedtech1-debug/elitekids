import { useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';

/* ── Garden element types and visuals ─────────────────────────── */

interface GardenElement {
  item_id: string;
  category: string;
  type: string;       // flower, tree, crystal, plant
  stage: string;      // seed, sprout, bloom, full
  tier: number;
  planted_at: string;
  upgraded_at?: string;
}

const STAGE_EMOJIS: Record<string, Record<string, string>> = {
  flower: { seed: '🌰', sprout: '🌱', bloom: '🌷', full: '🌸' },
  tree:   { seed: '🌰', sprout: '🌱', bloom: '🌳', full: '🌲' },
  crystal:{ seed: '💎', sprout: '🔷', bloom: '🔮', full: '✨' },
  plant:  { seed: '🌰', sprout: '🌱', bloom: '🌿', full: '🍀' },
};

const STAGE_SIZES: Record<string, string> = {
  seed: 'text-xl',
  sprout: 'text-2xl',
  bloom: 'text-3xl',
  full: 'text-4xl',
};

const CATEGORY_COLORS: Record<string, string> = {
  Animals: 'from-green-200 to-green-100',
  Letters: 'from-blue-200 to-blue-100',
  Shapes: 'from-purple-200 to-purple-100',
  Colors: 'from-amber-200 to-amber-100',
  Food: 'from-red-200 to-red-100',
};

function GardenPlant({ element, index }: { element: GardenElement; index: number }) {
  const emoji = STAGE_EMOJIS[element.type]?.[element.stage] || '🌱';
  const size = STAGE_SIZES[element.stage] || 'text-2xl';
  const delay = Math.min(index * 0.15, 1.5);

  return (
    <div
      className={`flex flex-col items-center gap-1 animate-game-slide-up`}
      style={{ animationDelay: `${delay}s` }}
    >
      <span className={`${size} drop-shadow-sm animate-game-float`} style={{ animationDelay: `${delay * 2}s` }}>
        {emoji}
      </span>
      <span className="text-[9px] font-medium text-gray-500 capitalize max-w-[60px] truncate">
        {element.item_id.replace(/-/g, ' ').split(' ').slice(-1)[0]}
      </span>
    </div>
  );
}

/* ── Main Garden Scene ────────────────────────────────────────── */

export default function GardenScene({ compact = false }: { compact?: boolean }) {
  const [elements, setElements] = useState<GardenElement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const studentId = decoded.admission_no || decoded.id;
      if (!studentId) { setLoading(false); return; }

      apiClient.get(ENDPOINTS.GARDEN.GET(studentId))
        .then((res) => {
          const garden = res.data?.data;
          setElements(garden?.garden_elements || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, []);

  if (loading) return null;
  if (elements.length === 0) return null;

  if (compact) {
    // Mini garden for the student home header
    return (
      <div className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 px-3 py-2 border border-green-200/50">
        <span className="text-sm">🌱</span>
        <span className="text-[10px] font-bold text-green-700">{elements.length}</span>
        {elements.slice(0, 3).map((el, i) => (
          <span key={i} className="text-xs">{STAGE_EMOJIS[el.type]?.[el.stage] || '🌱'}</span>
        ))}
        {elements.length > 3 && <span className="text-[9px] text-green-600">+{elements.length - 3}</span>}
      </div>
    );
  }

  // Full garden view
  return (
    <div className="rounded-2xl bg-gradient-to-b from-sky-100 to-green-100 p-4 shadow-inner border border-green-200/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏡</span>
        <h3 className="text-sm font-bold text-green-800">My Garden</h3>
        <span className="text-[10px] bg-green-200 text-green-700 rounded-full px-2 py-0.5 font-bold">
          {elements.length} plants
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {elements.map((el, i) => (
          <GardenPlant key={el.item_id} element={el} index={i} />
        ))}
      </div>
      {elements.length === 0 && (
        <p className="text-center text-xs text-green-600/60 py-4">
          Play games to grow your garden! 🌱
        </p>
      )}
    </div>
  );
}
