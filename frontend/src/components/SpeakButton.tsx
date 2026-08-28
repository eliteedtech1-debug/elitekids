import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { speak, stripEmojiForSpeech } from '@/lib/utils/sound';
import { t } from '@/lib/i18n';

interface SpeakButtonProps {
  /** Text to read aloud. Renders nothing when empty. */
  text?: string | null;
  className?: string;
  /** Override the accessible label (defaults to "Listen"). */
  label?: string;
  size?: 'sm' | 'md';
  /** @deprecated lang is ignored — TTS always speaks English. Only UI labels follow i18n. */
  lang?: string;
}


/**
 * Click-to-listen speaker button.
 *
 * Autoplay TTS is unreliable: browsers block `speechSynthesis.speak()` without
 * a user gesture (especially Android Chrome / iOS Safari), so questions can go
 * silent. A tap IS a user gesture — this button is the dependable fallback:
 * the child taps the speaker to hear the question read aloud.
 *
 * TTS always speaks English. Only the on-screen text labels follow i18n.
 */
export default function SpeakButton({ text, className = '', label, size = 'md' }: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const content = stripEmojiForSpeech(text || '');
  if (!content) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setSpeaking(true);
        speak(content).finally(() => setSpeaking(false));
      }}
      aria-label={label || t('common.listen')}
      title={label || t('common.listen')}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
      } ${
        speaking
          ? 'bg-[#0F4D92] text-white animate-pulse'
          : 'bg-[#0F4D92]/10 text-[#0F4D92] hover:bg-[#0F4D92]/20'
      } ${className}`}
    >
      <Volume2 className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
    </button>
  );
}
