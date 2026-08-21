/**
 * MediaLibrary — open-source media browser for the manual game builder.
 *
 * Categories: Animals, Insects, Food, Fruits, Colors, Shapes, Numbers,
 *             Letters, Nature, People, Vehicles, School, Music, Weather
 *
 * Each asset has: emoji, label, image URL (Twemoji), optional sound URL
 * Teachers tap to select; the game builder uses the asset.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, X, Volume2, Image, Smile, Music } from 'lucide-react';
import { EMOJI_CATEGORIES, searchEmojis, type EmojiEntry } from '@/lib/utils/emojiData';

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

// ── Extended categories beyond the base emojiData ──────────────────────────

interface MediaAsset {
  emoji: string;
  label: string;
  codepoint?: string;
  imageUrl?: string;
  soundUrl?: string;
  keywords: string;
  category: string;
  speakText?: string;
}

// Build image URL from emoji codepoint
function toImageUrl(emoji: string, codepoint?: string): string {
  const cp = codepoint || [...emoji].map((c) => c.codePointAt(0)!.toString(16)).join('-');
  return `${TWEMOJI_CDN}/${cp}.png`;
}

// ── Extra media categories (beyond emojiData) ──────────────────────────────

const INSECTS: MediaAsset[] = [
  { emoji: '🐛', label: 'Caterpillar', codepoint: '1f41b', keywords: 'caterpillar insect bug worm', category: 'insects' },
  { emoji: '🐛', label: 'Worm', codepoint: '1f41b', keywords: 'worm earthworm', category: 'insects' },
  { emoji: '🐝', label: 'Bee', codepoint: '1f41d', keywords: 'bee honeybee insect', category: 'insects' },
  { emoji: '🐞', label: 'Ladybug', codepoint: '1f41e', keywords: 'ladybug ladybird beetle insect', category: 'insects' },
  { emoji: '🦋', label: 'Butterfly', codepoint: '1f98b', keywords: 'butterfly insect', category: 'insects' },
  { emoji: '🐌', label: 'Snail', codepoint: '1f40c', keywords: 'snail shell insect', category: 'insects' },
  { emoji: '🐜', label: 'Ant', codepoint: '1f41c', keywords: 'ant insect', category: 'insects' },
  { emoji: '🪲', label: 'Beetle', codepoint: '1fab2', keywords: 'beetle insect bug', category: 'insects' },
  { emoji: '🪳', label: 'Cockroach', codepoint: '1fab3', keywords: 'cockroach insect bug', category: 'insects' },
  { emoji: '🦗', label: 'Cricket', codepoint: '1f997', keywords: 'cricket insect grasshopper', category: 'insects' },
  { emoji: '🕷️', label: 'Spider', codepoint: '1f577', keywords: 'spider insect web', category: 'insects' },
  { emoji: '🦂', label: 'Scorpion', codepoint: '1f982', keywords: 'scorpion insect desert', category: 'insects' },
];

const FRUITS: MediaAsset[] = [
  { emoji: '🍎', label: 'Apple', codepoint: '1f34e', keywords: 'apple fruit red', category: 'fruits' },
  { emoji: '🍌', label: 'Banana', codepoint: '1f34c', keywords: 'banana fruit yellow', category: 'fruits' },
  { emoji: '🍇', label: 'Grapes', codepoint: '1f347', keywords: 'grapes fruit purple', category: 'fruits' },
  { emoji: '🍊', label: 'Orange', codepoint: '1f34a', keywords: 'orange fruit citrus', category: 'fruits' },
  { emoji: '🍓', label: 'Strawberry', codepoint: '1f353', keywords: 'strawberry fruit red', category: 'fruits' },
  { emoji: '🥝', label: 'Kiwi', codepoint: '1f95d', keywords: 'kiwi fruit green', category: 'fruits' },
  { emoji: '🍉', label: 'Watermelon', codepoint: '1f349', keywords: 'watermelon fruit green red', category: 'fruits' },
  { emoji: '🍑', label: 'Peach', codepoint: '1f351', keywords: 'peach fruit pink', category: 'fruits' },
  { emoji: '🍒', label: 'Cherry', codepoint: '1f352', keywords: 'cherry fruit red', category: 'fruits' },
  { emoji: '🥭', label: 'Mango', codepoint: '1f96d', keywords: 'mango fruit tropical', category: 'fruits' },
  { emoji: '🍍', label: 'Pineapple', codepoint: '1f34d', keywords: 'pineapple fruit tropical', category: 'fruits' },
  { emoji: '🍋', label: 'Lemon', codepoint: '1f34b', keywords: 'lemon fruit yellow sour', category: 'fruits' },
  { emoji: '🫐', label: 'Blueberry', codepoint: '1fad0', keywords: 'blueberry fruit berry', category: 'fruits' },
  { emoji: '🍈', label: 'Melon', codepoint: '1f348', keywords: 'melon fruit cantaloupe', category: 'fruits' },
  { emoji: '🍐', label: 'Pear', codepoint: '1f350', keywords: 'pear fruit green', category: 'fruits' },
];

const SCHOOL: MediaAsset[] = [
  { emoji: '📚', label: 'Books', codepoint: '1f4da', keywords: 'books study school', category: 'school' },
  { emoji: '✏️', label: 'Pencil', codepoint: '270f', keywords: 'pencil write school', category: 'school' },
  { emoji: '🎒', label: 'Backpack', codepoint: '1f392', keywords: 'backpack bag school', category: 'school' },
  { emoji: '🏫', label: 'School', codepoint: '1f3eb', keywords: 'school building', category: 'school' },
  { emoji: '👩‍🏫', label: 'Teacher', codepoint: '1f469-200d-1f3eb', keywords: 'teacher woman school', category: 'school' },
  { emoji: '🧑‍🎓', label: 'Student', codepoint: '1f9d1-200d-1f393', keywords: 'student graduate school', category: 'school' },
  { emoji: '📏', label: 'Ruler', codepoint: '1f4cf', keywords: 'ruler measure school', category: 'school' },
  { emoji: '🖍️', label: 'Crayon', codepoint: '1f58d', keywords: 'crayon color draw school', category: 'school' },
  { emoji: '📌', label: 'Pin', codepoint: '1f4cc', keywords: 'pin pushpin board school', category: 'school' },
  { emoji: '🔢', label: 'Numbers', codepoint: '1f522', keywords: 'numbers math school', category: 'school' },
];

const WEATHER: MediaAsset[] = [
  { emoji: '☀️', label: 'Sun', codepoint: '2600', keywords: 'sun sunny weather hot', category: 'weather' },
  { emoji: '🌧️', label: 'Rain', codepoint: '1f327', keywords: 'rain rainy weather cloud', category: 'weather' },
  { emoji: '❄️', label: 'Snow', codepoint: '2744', keywords: 'snow snowy weather cold', category: 'weather' },
  { emoji: '🌈', label: 'Rainbow', codepoint: '1f308', keywords: 'rainbow weather color', category: 'weather' },
  { emoji: '⛈️', label: 'Storm', codepoint: '1f329', keywords: 'storm thunder lightning', category: 'weather' },
  { emoji: '🌤️', label: 'Partly Cloudy', codepoint: '1f324', keywords: 'cloudy weather sun', category: 'weather' },
  { emoji: '🌙', label: 'Moon', codepoint: '1f319', keywords: 'moon night weather', category: 'weather' },
  { emoji: '⭐', label: 'Star', codepoint: '2b50', keywords: 'star night weather', category: 'weather' },
  { emoji: '🌊', label: 'Wave', codepoint: '1f30a', keywords: 'wave water ocean weather', category: 'weather' },
  { emoji: '💨', label: 'Wind', codepoint: '1f4a8', keywords: 'wind blow weather', category: 'weather' },
];

// ── Sound effects library ──────────────────────────────────────────────────

interface SoundAsset {
  id: string;
  label: string;
  category: string;
  emoji: string;
  /** Inline base64 or URL — for now we use speech synthesis as placeholder */
  soundType: 'speak' | 'sfx';
  speakText?: string;
}

const SOUND_EFFECTS: SoundAsset[] = [
  // Animals
  { id: 'sfx-dog', label: 'Dog', category: 'animals', emoji: '🐶', soundType: 'speak', speakText: 'Woof woof!' },
  { id: 'sfx-cat', label: 'Cat', category: 'animals', emoji: '🐱', soundType: 'speak', speakText: 'Meow!' },
  { id: 'sfx-cow', label: 'Cow', category: 'animals', emoji: '🐮', soundType: 'speak', speakText: 'Moo!' },
  { id: 'sfx-sheep', label: 'Sheep', category: 'animals', emoji: '🐑', soundType: 'speak', speakText: 'Baa baa!' },
  { id: 'sfx-duck', label: 'Duck', category: 'animals', emoji: '🦆', soundType: 'speak', speakText: 'Quack quack!' },
  { id: 'sfx-chicken', label: 'Chicken', category: 'animals', emoji: '🐔', soundType: 'speak', speakText: 'Cluck cluck!' },
  { id: 'sfx-horse', label: 'Horse', category: 'animals', emoji: '🐴', soundType: 'speak', speakText: 'Neigh!' },
  { id: 'sfx-pig', label: 'Pig', category: 'animals', emoji: '🐷', soundType: 'speak', speakText: 'Oink oink!' },
  { id: 'sfx-frog', label: 'Frog', category: 'animals', emoji: '🐸', soundType: 'speak', speakText: 'Ribbit!' },
  { id: 'sfx-bird', label: 'Bird', category: 'animals', emoji: '🐦', soundType: 'speak', speakText: 'Tweet tweet!' },
  { id: 'sfx-lion', label: 'Lion', category: 'animals', emoji: '🦁', soundType: 'speak', speakText: 'Roar!' },
  { id: 'sfx-elephant', label: 'Elephant', category: 'animals', emoji: '🐘', soundType: 'speak', speakText: 'Trumpet!' },
  // Insects
  { id: 'sfx-bee', label: 'Bee', category: 'insects', emoji: '🐝', soundType: 'speak', speakText: 'Bzzzz!' },
  { id: 'sfx-cricket', label: 'Cricket', category: 'insects', emoji: '🦗', soundType: 'speak', speakText: 'Chirp chirp!' },
  // Nature
  { id: 'sfx-rain', label: 'Rain', category: 'nature', emoji: '🌧️', soundType: 'speak', speakText: 'Pitter patter rain!' },
  { id: 'sfx-thunder', label: 'Thunder', category: 'nature', emoji: '⛈️', soundType: 'speak', speakText: 'Boom! Thunder!' },
  { id: 'sfx-wind', label: 'Wind', category: 'nature', emoji: '💨', soundType: 'speak', speakText: 'Whoosh! Wind!' },
  // Vehicles
  { id: 'sfx-car', label: 'Car', category: 'vehicles', emoji: '🚗', soundType: 'speak', speakText: 'Vroom vroom!' },
  { id: 'sfx-train', label: 'Train', category: 'vehicles', emoji: '🚂', soundType: 'speak', speakText: 'Choo choo!' },
  { id: 'sfx-plane', label: 'Airplane', category: 'vehicles', emoji: '✈️', soundType: 'speak', speakText: 'Whoosh! Plane flying!' },
  { id: 'sfx-boat', label: 'Boat', category: 'vehicles', emoji: '🚢', soundType: 'speak', speakText: 'Ahoy! Boat sailing!' },
  // School
  { id: 'sfx-bell', label: 'School Bell', category: 'school', emoji: '🔔', soundType: 'speak', speakText: 'Ring ring! School bell!' },
  { id: 'sfx-hello', label: 'Hello', category: 'greetings', emoji: '👋', soundType: 'speak', speakText: 'Hello!' },
  { id: 'sfx-thankyou', label: 'Thank You', category: 'greetings', emoji: '🙏', soundType: 'speak', speakText: 'Thank you!' },
  { id: 'sfx-please', label: 'Please', category: 'greetings', emoji: '😊', soundType: 'speak', speakText: 'Please!' },
  { id: 'sfx-goodbye', label: 'Goodbye', category: 'greetings', emoji: '👋', soundType: 'speak', speakText: 'Goodbye!' },
  { id: 'sfx-well-done', label: 'Well Done!', category: 'feedback', emoji: '🎉', soundType: 'speak', speakText: 'Well done! Great job!' },
  { id: 'sfx-try-again', label: 'Try Again', category: 'feedback', emoji: '💪', soundType: 'speak', speakText: 'Try again! You can do it!' },
];

// ── Category definitions ───────────────────────────────────────────────────

export interface MediaCategory {
  id: string;
  label: string;
  icon: string;
  type: 'emoji' | 'sound' | 'both';
}

export const MEDIA_CATEGORIES: MediaCategory[] = [
  { id: 'animals',    label: 'Animals',    icon: '🐾', type: 'both' },
  { id: 'insects',    label: 'Insects',    icon: '🐛', type: 'both' },
  { id: 'food',       label: 'Food',       icon: '🍕', type: 'emoji' },
  { id: 'fruits',     label: 'Fruits',     icon: '🍎', type: 'both' },
  { id: 'colors',     label: 'Colors',     icon: '🎨', type: 'emoji' },
  { id: 'shapes',     label: 'Shapes',     icon: '⬡', type: 'emoji' },
  { id: 'numbers',    label: 'Numbers',    icon: '🔢', type: 'emoji' },
  { id: 'nature',     label: 'Nature',     icon: '🌿', type: 'both' },
  { id: 'vehicles',   label: 'Vehicles',   icon: '🚗', type: 'both' },
  { id: 'school',     label: 'School',     icon: '📚', type: 'both' },
  { id: 'weather',    label: 'Weather',    icon: '🌤️', type: 'both' },
  { id: 'greetings',  label: 'Greetings',  icon: '👋', type: 'sound' },
  { id: 'feedback',   label: 'Feedback',   icon: '⭐', type: 'sound' },
];

// ── Get all assets for a category ──────────────────────────────────────────

function getAssetsForCategory(categoryId: string): MediaAsset[] {
  // Check base emoji categories first
  const emojiCat = EMOJI_CATEGORIES.find((c) => c.id === categoryId);
  if (emojiCat) {
    return emojiCat.emojis.map((e) => ({
      ...e,
      imageUrl: e.codepoint ? toImageUrl(e.emoji, e.codepoint) : undefined,
      category: categoryId,
    }));
  }
  // Check extended categories
  switch (categoryId) {
    case 'insects': return INSECTS.map((e) => ({ ...e, imageUrl: toImageUrl(e.emoji, e.codepoint) }));
    case 'fruits': return FRUITS.map((e) => ({ ...e, imageUrl: toImageUrl(e.emoji, e.codepoint) }));
    case 'school': return SCHOOL.map((e) => ({ ...e, imageUrl: toImageUrl(e.emoji, e.codepoint) }));
    case 'weather': return WEATHER.map((e) => ({ ...e, imageUrl: toImageUrl(e.emoji, e.codepoint) }));
    default: return [];
  }
}

function getSoundsForCategory(categoryId: string): SoundAsset[] {
  return SOUND_EFFECTS.filter((s) => s.category === categoryId);
}

// ── Component ──────────────────────────────────────────────────────────────

interface MediaLibraryProps {
  /** Called when user selects an asset */
  onSelect: (asset: { emoji: string; label: string; imageUrl?: string; soundUrl?: string; soundText?: string }) => void;
  onClose: () => void;
  /** Filter to only show certain types */
  filter?: 'emoji' | 'sound' | 'all';
  /** Pre-selected category */
  initialCategory?: string;
}

export default function MediaLibrary({
  onSelect,
  onClose,
  filter = 'all',
  initialCategory = 'animals',
}: MediaLibraryProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'search'>(filter === 'all' ? 'browse' : 'browse');
  const searchRef = useRef<HTMLInputElement>(null);

  // Get assets for current category
  const categoryAssets = useMemo(() => {
    const emojis = getAssetsForCategory(activeCategory);
    const sounds = getSoundsForCategory(activeCategory);
    if (filter === 'sound') return sounds.map((s) => ({ ...s, type: 'sound' as const }));
    if (filter === 'emoji') return emojis;
    return [...emojis, ...sounds.map((s) => ({ ...s, type: 'sound' as const, imageUrl: s.emoji ? toImageUrl(s.emoji) : undefined }))];
  }, [activeCategory, filter]);

  // Search across all categories
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    const results: (MediaAsset & { type?: string })[] = [];

    // Search emojis
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (
          e.label.toLowerCase().includes(q) ||
          e.keywords.toLowerCase().includes(q) ||
          e.emoji.includes(q)
        ) {
          results.push({ ...e, imageUrl: e.codepoint ? toImageUrl(e.emoji, e.codepoint) : undefined, category: cat.id });
        }
      }
    }
    // Search extended
    [...INSECTS, ...FRUITS, ...SCHOOL, ...WEATHER].forEach((a) => {
      if (a.label.toLowerCase().includes(q) || a.keywords.toLowerCase().includes(q)) {
        results.push(a);
      }
    });
    // Search sounds
    if (filter !== 'emoji') {
      SOUND_EFFECTS.forEach((s) => {
        if (s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) {
          results.push({ emoji: s.emoji, label: s.label, codepoint: '', keywords: s.id, category: s.category, type: 'sound', imageUrl: s.emoji ? toImageUrl(s.emoji) : undefined, soundUrl: undefined, speakText: s.speakText });
        }
      });
    }
    return results.slice(0, 50);
  }, [search, filter]);

  const handleSelect = useCallback((asset: any) => {
    if (asset.type === 'sound') {
      onSelect({
        emoji: asset.emoji || '🔊',
        label: asset.label,
        imageUrl: asset.emoji ? toImageUrl(asset.emoji) : undefined,
        soundText: asset.speakText,
      });
    } else {
      onSelect({
        emoji: asset.emoji,
        label: asset.label,
        imageUrl: asset.imageUrl || (asset.codepoint ? toImageUrl(asset.emoji, asset.codepoint) : undefined),
      });
    }
  }, [onSelect]);

  // Play sound preview
  const playSound = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.8;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-bold text-gray-800">Media Library 🎨</h2>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActiveTab(e.target.value ? 'search' : 'browse'); }}
            placeholder="Search animals, colors, sounds..."
            className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-[#0F4D92] focus:outline-none"
          />
        </div>
      </div>

      {/* Category tabs */}
      {activeTab === 'browse' && (
        <div className="flex gap-1 overflow-x-auto border-b px-4 py-2 scrollbar-hide">
          {MEDIA_CATEGORIES.map((cat) => {
            if (filter === 'emoji' && cat.type === 'sound') return null;
            if (filter === 'sound' && cat.type === 'emoji') return null;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeCategory === cat.id
                    ? 'bg-[#0F4D92] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'search' ? (
          searchResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No results for "{search}"</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {searchResults.map((asset, i) => (
                <AssetCard key={`${asset.emoji}-${i}`} asset={asset} onSelect={handleSelect} onPlaySound={playSound} />
              ))}
            </div>
          )
        ) : (
          <>
            <p className="mb-3 text-xs font-medium text-gray-400">
              {MEDIA_CATEGORIES.find((c) => c.id === activeCategory)?.icon}{' '}
              {MEDIA_CATEGORIES.find((c) => c.id === activeCategory)?.label}
              <span className="ml-1 text-gray-300">({categoryAssets.length})</span>
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {categoryAssets.map((asset: any, i: number) => (
                <AssetCard key={`${asset.emoji}-${i}`} asset={asset} onSelect={handleSelect} onPlaySound={playSound} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Asset Card ─────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onSelect,
  onPlaySound,
}: {
  asset: any;
  onSelect: (a: any) => void;
  onPlaySound: (text: string) => void;
}) {
  const isSound = asset.type === 'sound' || asset.soundType === 'speak';
  const imageUrl = asset.imageUrl || (asset.codepoint ? toImageUrl(asset.emoji, asset.codepoint) : undefined);

  return (
    <button
      onClick={() => onSelect(asset)}
      className="group relative flex flex-col items-center gap-1 rounded-xl border border-gray-100 bg-white p-2 transition-all hover:border-[#0F4D92] hover:shadow-md hover:animate-game-squish active:scale-95"
    >
      {/* Image/Emoji */}
      <div className="flex h-12 w-12 items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.label}
            className="h-10 w-10 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <span className={`text-3xl ${imageUrl ? 'hidden' : ''}`}>{asset.emoji}</span>
      </div>
      <span className="text-[10px] font-medium text-gray-600 leading-tight text-center">{asset.label}</span>
      {/* Sound preview button */}
      {isSound && asset.speakText && (
        <button
          onClick={(e) => { e.stopPropagation(); onPlaySound(asset.speakText); }}
          className="absolute -top-1 -right-1 rounded-full bg-[#0F4D92] p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Preview sound"
        >
          <Volume2 className="h-3 w-3" />
        </button>
      )}
    </button>
  );
}
