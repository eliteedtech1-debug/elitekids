import { useState } from 'react';
import { Settings, Eye, Type, Zap, Palette, RotateCcw } from 'lucide-react';
import { useA11yStore } from '@/lib/utils/a11y-store';

/**
 * Accessibility settings panel — toggles for colorblind mode, reduced motion,
 * high contrast, and large text. Designed for parent/teacher use (not child-facing).
 *
 * Renders as a collapsible panel with a gear icon trigger.
 */
export default function A11ySettings() {
  const [open, setOpen] = useState(false);
  const {
    colorblindMode,
    reducedMotion,
    highContrast,
    largeText,
    toggleColorblind,
    toggleReducedMotion,
    toggleHighContrast,
    toggleLargeText,
    reset,
  } = useA11yStore();

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-label="Accessibility settings"
        aria-expanded={open}
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">A11y</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Accessibility</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {/* Colorblind mode */}
            <ToggleRow
              icon={<Palette className="h-4 w-4" />}
              label="Colorblind-safe colors"
              description="Blue/orange instead of green/red"
              checked={colorblindMode}
              onChange={toggleColorblind}
            />

            {/* Reduced motion */}
            <ToggleRow
              icon={<Zap className="h-4 w-4" />}
              label="Reduce motion"
              description="Disable animations"
              checked={reducedMotion}
              onChange={toggleReducedMotion}
            />

            {/* High contrast */}
            <ToggleRow
              icon={<Eye className="h-4 w-4" />}
              label="High contrast"
              description="Increase text/border contrast"
              checked={highContrast}
              onChange={toggleHighContrast}
            />

            {/* Large text */}
            <ToggleRow
              icon={<Type className="h-4 w-4" />}
              label="Larger text"
              description="Increase font sizes by 20%"
              checked={largeText}
              onChange={toggleLargeText}
            />
          </div>

          {/* Reset button */}
          <button
            onClick={reset}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

/** Reusable toggle row. */
function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 transition hover:bg-gray-50">
      <span className="mt-0.5 text-gray-500">{icon}</span>
      <div className="flex-1">
        <span className="block text-sm font-semibold text-gray-700">{label}</span>
        <span className="block text-xs text-gray-400">{description}</span>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer sr-only"
          aria-label={label}
        />
        <div className="h-6 w-11 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2">
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </div>
      </div>
    </label>
  );
}
