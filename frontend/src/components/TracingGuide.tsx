import { useState } from 'react';
import { t } from '@/lib/i18n';
import DrawingCanvas, { type RawPoint } from '@/components/DrawingCanvas';
import { strokeCoverage, TRACE_PATHS, type Stroke } from '@/lib/utils/drawing';

/**
 * TracingGuide (Q2 drawing FE leaf, Q26).
 *
 * Ghost-line tracer: shows a built-in shape/digit as a faint guide line, the
 * kid draws over it, and a live "on the line" % updates with each completed
 * stroke (pure geometry — strokeCoverage). Parent receives the graded stroke
 * list via onStrokes so DrawingFeedback can score the whole attempt.
 */

interface TracingGuideProps {
  /** Trace path key (see TRACE_PATHS) or a raw normalized path. */
  path: Stroke | string;
  /** Called with ALL strokes (normalized) after each completed stroke. */
  onStrokes?: (strokes: Stroke[]) => void;
  /** Called with the latest live coverage % (0–100) after each stroke. */
  onCoverage?: (pct: number) => void;
  disabled?: boolean;
  label?: string;
}

function resolvePath(path: Stroke | string): Stroke {
  if (typeof path === 'string') return TRACE_PATHS[path] || [];
  return path;
}

export default function TracingGuide({ path, onStrokes, onCoverage, disabled = false, label }: TracingGuideProps) {
  const target = resolvePath(path);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [coverage, setCoverage] = useState(0);

  // DrawingCanvas already emits NORMALIZED 0–1 points — use them directly.
  const handleStroke = (raw: RawPoint[]) => {
    const norm = raw as Stroke;
    if (norm.length < 2) return;
    const next = [...strokes, norm];
    setStrokes(next);
    onStrokes?.(next);
    const merged: Stroke = next.flat();
    const pct = Math.round(strokeCoverage(merged, target) * 100);
    setCoverage(pct);
    onCoverage?.(pct);
  };

  return (
    <div>
      {/* Ghost guide rendered as an SVG layer that sits under the canvas via
          negative margins — the canvas is transparent where the kid hasn't
          drawn, so the guide stays visible through it. */}
      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
          aria-hidden
        >
          {target.length > 1 && (
            <polyline
              points={target.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
            />
          )}
        </svg>
        <DrawingCanvas onStroke={handleStroke} disabled={disabled} showToolbar={false} />
      </div>

      <div className="mt-2 flex items-center justify-between">
        {label ? (
          <p className="text-xs font-bold text-gray-600">{label}</p>
        ) : (
          <span />
        )}
        <p className="text-[11px] font-black text-teal-600">
          {t('drawing.onLine', { pct: coverage, defaultValue: 'On the line: {pct}%' })}
        </p>
      </div>
    </div>
  );
}