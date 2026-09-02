import { useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';

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
      <span className="text-[9px] font-medium text-green-700 capitalize max-w-[60px] truncate">
        {element.item_id.replace(/-/g, ' ').split(' ').slice(-1)[0]}
      </span>
    </div>
  );
}

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-20 ${className}`} />
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
    // Mini garden for the student home header — game-style glassmorphism
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-50/80 via-emerald-50/60 to-teal-50/40 backdrop-blur-xl px-4 py-2.5 border border-green-200/40 shadow-lg shadow-green-200/20">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-green-300/20 blur-xl" />
        <div className="relative flex items-center gap-1.5">
          <span className="text-sm">🌱</span>
          <span className="text-[11px] font-bold text-green-700">{elements.length}</span>
          {elements.slice(0, 3).map((el, i) => (
            <span key={i} className="text-xs drop-shadow-sm">{STAGE_EMOJIS[el.type]?.[el.stage] || '🌱'}</span>
          ))}
          {elements.length > 3 && <span className="text-[9px] font-bold text-green-600">+{elements.length - 3}</span>}
        </div>
      </div>
    );
  }

  // Full garden view — game-style
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100/80 via-green-50/60 to-emerald-100/80 p-5 shadow-inner border border-green-200/30">
      <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-green-400 to-emerald-400" />
      <FloatingDeco className="-left-6 -bottom-6 h-20 w-20 bg-gradient-to-br from-sky-400 to-blue-400" />
      <div className="relative flex items-center gap-2.5 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-300/40">
          <span className="text-lg">🏡</span>
        </div>
        <h3 className="text-sm font-extrabold text-green-800">{t('garden.title')}</h3>
        <span className="text-[10px] bg-green-200/80 text-green-700 rounded-full px-2.5 py-0.5 font-bold">
          {t('garden.plants', { count: elements.length })}
        </span>
      </div>
      <div className="relative grid grid-cols-4 sm:grid-cols-6 gap-3">
        {elements.map((el, i) => (
          <GardenPlant key={el.item_id} element={el} index={i} />
        ))}
      </div>
      {elements.length === 0 && (
        <p className="relative text-center text-xs text-green-600/60 py-4 font-medium">
          {t('garden.empty')}
        </p>
      )}
    </div>
  );
}
