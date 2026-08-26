import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, RotateCcw } from 'lucide-react';
import { useSpeechStore, getAvailableVoices } from '@/lib/utils/speech-store';
import { speak } from '@/lib/utils/sound';
import { haptic } from '@/lib/utils/haptic';
import { t } from '@/lib/i18n';

/**
 * Speech settings panel — speed slider + voice picker.
 * Renders as a Volume icon that opens a popover.
 * Used in StudentHome and GamePlay headers.
 */
export default function SpeechSettings() {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const { rate, voiceName, pitch, setRate, setVoice, setPitch, reset } = useSpeechStore();

  // Load voices (Chrome loads async)
  useEffect(() => {
    const load = () => setVoices(getAvailableVoices());
    load();
    if (window.speechSynthesis?.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = load;
    }
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [open]);

  // Close on outside click (works for both mouse and touch)
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handlePreview = () => {
    haptic('light');
    speak('Hello! This is how I sound!', undefined, rate);
  };

  const speedLabel = rate <= 0.5 ? t('speech.speedVerySlow') : rate <= 0.7 ? t('speech.speedSlow') : rate <= 1.0 ? t('speech.speedNormal') : rate <= 1.3 ? t('speech.speedFast') : t('speech.speedVeryFast');

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-2 sm:px-2.5 sm:py-1.5 text-sm font-medium text-[#0F4D92]/60 transition hover:bg-gray-50 hover:text-[#0F4D92] active:scale-95"
        aria-label={t('speech.settings')}
        aria-expanded={open}
      >
        <Volume2 className="h-5 w-5" />
      </button>

      {/* Panel */}
      {open && (
        <>
        {/* Backdrop — tap to close */}
        <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent sm:static sm:hidden" onClick={() => setOpen(false)} />
        <div className="fixed inset-x-3 top-14 z-50 mx-auto max-w-[calc(100vw-24px)] sm:absolute sm:right-0 sm:top-full sm:mx-0 sm:mt-2 sm:w-80 sm:max-w-none rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">{t('speech.title')}</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label={t('speech.close')}>✕</button>
          </div>

          {/* Speed slider */}
          <div className="mb-4 sm:mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">{t('speech.speed')}</label>
              <span className="text-xs text-gray-400">{speedLabel} ({rate.toFixed(1)}x)</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2.0"
              step="0.05"
              value={rate}
              onChange={(e) => { haptic('selection'); setRate(parseFloat(e.target.value)); }}
              className="w-full h-3 rounded-full appearance-none cursor-pointer accent-[#0F4D92]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>0.3x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* Pitch slider */}
          <div className="mb-4 sm:mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">{t('speech.pitch')}</label>
              <span className="text-xs text-gray-400">{pitch < 1.0 ? ` ${t('speech.pitchLower').toLowerCase()}` : pitch > 1.3 ? ` ${t('speech.pitchHigh').toLowerCase()}` : ` ${t('speech.normal').toLowerCase()}`} ({pitch.toFixed(1)})</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={pitch}
              onChange={(e) => { haptic('selection'); setPitch(parseFloat(e.target.value)); }}
              className="w-full h-3 rounded-full appearance-none cursor-pointer accent-purple-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>{t('speech.low')}</span>
              <span>{t('speech.normal')}</span>
              <span>{t('speech.pitchHigh')}</span>
            </div>
          </div>

          {/* Voice picker */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold text-gray-600">{t('speech.voice')}</label>
            {voices.length === 0 ? (
              <p className="text-xs text-gray-400">{t('speech.noVoices')}</p>
            ) : (
              <div className="max-h-32 sm:max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-2">
                {/* Auto option */}
                <button
                  onClick={() => { haptic('selection'); setVoice(''); }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                    !voiceName ? 'bg-[#0F4D92] text-white' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {t('speech.auto')}
                </button>
                {voices.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => { haptic('selection'); setVoice(v.name); }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                      voiceName === v.name ? 'bg-[#0F4D92] text-white' : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-1 opacity-60">({v.lang})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview + Reset */}
          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0F4D92] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0b3d76]"
            >
              <Play className="h-3 w-3" /> {t('speech.preview')}
            </button>
            <button
              onClick={() => { haptic('light'); reset(); }}
              className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-3 w-3" /> {t('speech.reset')}
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
