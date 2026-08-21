import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Image,
  Search,
  RefreshCw,
  Loader2,
  HardDrive,
  BarChart3,
  Trash2,
  ExternalLink,
  Package,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import AdminNav from '@/components/AdminNav';
import CachedImg from '@/components/CachedImg';

interface Asset {
  key: string;
  url: string;
  category: string;
  label: string;
  hash: string;
  size: number;
  lastModified: string;
  usageCount: number;
  lessonCount: number;
  states: string[];
}

interface AssetStats {
  total: number;
  totalSize: number;
  categories: Record<string, number>;
  totalUsage: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const CATEGORY_EMOJIS: Record<string, string> = {
  animals: '🐾', insects: '🐛', food: '🍕', fruits: '🍎', colors: '🎨',
  shapes: '⬡', numbers: '🔢', nature: '🌿', vehicles: '🚗', school: '📚',
  weather: '🌤️', greetings: '👋', feedback: '⭐', misc: '📦',
};

export default function AssetLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.MEDIA.OPENSOURCE_ASSETS);
      setAssets(res.data?.data?.assets || []);
      setStats(res.data?.data?.stats || null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Filter
  const filtered = assets.filter((a) => {
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.key.toLowerCase().includes(q);
    }
    return true;
  });

  const categories = Object.entries(stats?.categories || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Stats overview */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Package className="h-4 w-4" />
                <p className="text-xs">Total Assets</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#0F4D92]">{stats.total}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <HardDrive className="h-4 w-4" />
                <p className="text-xs">Storage Used</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-purple-600">{formatBytes(stats.totalSize)}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <BarChart3 className="h-4 w-4" />
                <p className="text-xs">Total Usage</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-green-600">{stats.totalUsage}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500">
                <Image className="h-4 w-4" />
                <p className="text-xs">Categories</p>
              </div>
              <p className="mt-1 text-2xl font-bold text-amber-600">{categories.length}</p>
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assets..."
              className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-[#0F4D92] focus:outline-none"
            />
          </div>
          <button
            onClick={loadAssets}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Category chips */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              categoryFilter === 'all' ? 'bg-[#0F4D92] text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
            }`}
          >
            All ({assets.length})
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                categoryFilter === cat ? 'bg-[#0F4D92] text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
              }`}
            >
              {CATEGORY_EMOJIS[cat] || '📦'} {cat} ({count})
            </button>
          ))}
        </div>

        {/* Asset grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <Image className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">
              {search ? `No assets matching "${search}"` : 'No saved assets yet. Assets are saved when teachers publish games.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((asset) => (
              <div
                key={asset.key}
                className="group relative rounded-2xl bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-[#0F4D92]/30 border border-gray-100"
              >
                {/* Image preview */}
                <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-xl bg-gray-50">
                  <CachedImg
                    src={asset.url}
                    alt={asset.label}
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>

                {/* Info */}
                <p className="truncate text-xs font-semibold text-gray-800">{asset.label}</p>
                <p className="text-[10px] text-gray-400">
                  {CATEGORY_EMOJIS[asset.category] || '📦'} {asset.category} · {formatBytes(asset.size)}
                </p>

                {/* Usage badge */}
                {asset.usageCount > 0 ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                    <BarChart3 className="h-2.5 w-2.5" />
                    Used in {asset.lessonCount} lesson{asset.lessonCount !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="mt-1.5 inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                    Unused
                  </span>
                )}

                {/* Hover actions */}
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white p-1.5 shadow-md text-gray-500 hover:text-[#0F4D92]"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
