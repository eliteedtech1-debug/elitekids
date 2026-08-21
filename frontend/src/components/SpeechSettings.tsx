import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, RotateCcw } from 'lucide-react';
import { useSpeechStore, getAvailableVoices } from '@/lib/utils/speech-store';
import { speak } from '@/lib/utils/sound';

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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handlePreview = () => {
    speak('Hello! This is how I sound!', undefined, rate);
  };

  const speedLabel = rate <= 0.5 ? '🐢 Very slow' : rate <= 0.7 ? '🐇 Slow' : rate <= 1.0 ? ' normal' : rate <= 1.3 ? '⚡ Fast' : '🚀 Very fast';

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-[#0F4D92]/60 transition hover:bg-gray-50 hover:text-[#0F4D92]"
        aria-label="Voice settings"
        aria-expanded={open}
      >
        <Volume2 className="h-5 w-5" />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">🔊 Voice Settings</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
          </div>

          {/* Speed slider */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">Speed</label>
              <span className="text-xs text-gray-400">{speedLabel} ({rate.toFixed(1)}x)</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2.0"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#0F4D92]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>0.3x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </div>

          {/* Pitch slider */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600">Pitch</label>
              <span className="text-xs text-gray-400">{pitch < 1.0 ? ' lower' : pitch > 1.3 ? ' high' : ' normal'} ({pitch.toFixed(1)})</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-purple-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>Low</span>
              <span>Normal</span>
              <span>High</span>
            </div>
          </div>

          {/* Voice picker */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold text-gray-600">Voice</label>
            {voices.length === 0 ? (
              <p className="text-xs text-gray-400">No voices available on this device.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-2">
                {/* Auto option */}
                <button
                  onClick={() => setVoice('')}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                    !voiceName ? 'bg-[#0F4D92] text-white' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  🤖 Auto (best match)
                </button>
                {voices.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setVoice(v.name)}
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
              <Play className="h-3 w-3" /> Preview
            </button>
            <button
              onClick={() => { reset(); }}
              className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
