/**
 * StickerButton — floating emoji button that opens EmojiPicker modal.
 * Drop-in component: place anywhere on the page.
 */

import { useState } from 'react';
import EmojiPicker from './EmojiPicker';

interface StickerButtonProps {
  onSelect: (emoji: string, label: string) => void;
  /** Position: bottom-right (default), bottom-left, top-right, top-left */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
}

const POSITIONS = {
  'bottom-right': 'bottom-6 right-6',
  'bottom-left': 'bottom-6 left-6',
  'top-right': 'top-6 right-6',
  'top-left': 'top-6 left-6',
};

const SIZES = {
  sm: 'h-11 w-11 text-xl',
  md: 'h-14 w-14 text-2xl',
  lg: 'h-16 w-16 text-3xl',
};

export default function StickerButton({ onSelect, position = 'bottom-right', size = 'lg' }: StickerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string, label: string) => {
    onSelect(emoji, label);
    setOpen(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${POSITIONS[position]} z-40 flex ${SIZES[size]} items-center justify-center rounded-full bg-[#0F4D92] text-white shadow-lg transition-all hover:scale-110 hover:shadow-xl active:scale-95 animate-game-pulse`}
        title="Open emoji picker"
      >
        😊
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md animate-game-pop">
            <EmojiPicker
              onSelect={handleSelect}
              onClose={() => setOpen(false)}
              mode="modal"
            />
          </div>
        </div>
      )}
    </>
  );
}
