/**
 * EmojiPicker — WhatsApp-style sticker/emoji picker.
 *
 * Features:
 *  - Category tabs with icons (bottom bar, WhatsApp-style)
 *  - Search with instant filtering
 *  - Recently-used section (persisted in localStorage)
 *  - Grid layout with big touch targets for kids
 *  - Falls back to Twemoji images for cross-platform consistency
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, Clock, X } from 'lucide-react';
import type { EmojiEntry, EmojiCategory } from '@/lib/utils/emojiData';

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';
const RECENT_KEY = 'emoji_picker_recent';
const MAX_RECENT = 24;

function getRecent(): EmojiEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: EmojiEntry) {
  const recent = getRecent().filter((e) => e.emoji !== emoji.emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

interface EmojiPickerProps {
  onSelect: (emoji: string, label: string) => void;
  onClose?: () => void;
  /** Show as compact floating panel or full-screen */
  mode?: 'panel' | 'modal';
}

export default function EmojiPicker({ onSelect, onClose, mode = 'panel' }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState('recent');
  const [search, setSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<EmojiEntry[]>(getRecent);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Reset scroll when tab changes
  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [activeTab, search]);

  const handleSelect = useCallback((entry: EmojiEntry) => {
    onSelect(entry.emoji, entry.label);
    saveRecent(entry);
    setRecentEmojis(getRecent());
  }, [onSelect]);

  // #11 perf: lazy-load emoji data (684 lines) only when picker opens
  const [categories, setCategories] = useState<EmojiCategory[]>([]);
  const [searchFn, setSearchFn] = useState<((q: string) => EmojiEntry[]) | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/utils/emojiData').then((mod) => {
      if (!cancelled) {
        setCategories(mod.EMOJI_CATEGORIES);
        setSearchFn(() => mod.searchEmojis);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Determine which emojis to show
  const displayEmojis = useMemo(() => {
    if (search && searchFn) return searchFn(search);
    if (activeTab === 'recent') return recentEmojis;
    const cat = categories.find((c) => c.id === activeTab);
    return cat?.emojis || [];
  }, [activeTab, search, recentEmojis, categories, searchFn]);

  // Available tabs — always show "recent" first
  const tabs: { id: string; label: string; icon: string }[] = useMemo(() => {
    const recentTab = { id: 'recent', label: 'Recent', icon: '🕐' };
    return [recentTab, ...categories.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))];
  }, [categories]);

  const isModal = mode === 'modal';

  return (
    <div
      className={`flex flex-col bg-white ${isModal ? 'fixed inset-0 z-50 max-h-screen' : 'rounded-2xl border border-gray-200 shadow-xl'}`}
      style={{ maxHeight: isModal ? '100vh' : '420px' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full rounded-xl bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#0F4D92]/30 font-kid-body"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-200"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Category tabs (bottom bar like WhatsApp) */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-gray-100 px-1 py-1.5 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); }}
            title={tab.label}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-all ${
              activeTab === tab.id
                ? 'bg-[#0F4D92]/10 scale-110 shadow-sm'
                : 'hover:bg-gray-100 opacity-60'
            }`}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Section label */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 font-kid-body">
          {search
            ? `Search: "${search}"`
            : activeTab === 'recent'
            ? 'Recently Used'
            : tabs.find((t) => t.id === activeTab)?.label || ''}
        </span>
      </div>

      {/* Emoji grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {displayEmojis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <span className="text-3xl mb-2">🔍</span>
            <p className="text-sm font-kid-body">
              {search ? 'No emojis found' : 'No recent emojis yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1 sm:grid-cols-9">
            {displayEmojis.map((entry, i) => (
              <button
                key={`${entry.emoji}-${i}`}
                onClick={() => handleSelect(entry)}
                title={entry.label}
                className="flex h-10 w-full items-center justify-center rounded-lg text-2xl transition-all hover:bg-[#0F4D92]/10 hover:scale-125 active:scale-90 font-kid"
              >
                {entry.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
