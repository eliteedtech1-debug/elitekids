import { useMemo } from 'react';
import { RotateCcw, Star } from 'lucide-react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import { scoreDrawing, type Stroke } from '@/lib/utils/drawing';

/**
 * DrawingFeedback (Q2 drawing FE leaf, Q26).
 *
 * Scores the kid's strokes against a target trace path using pure geometry
 * (stroke-on-path coverage + bounding-box IoU → deterministic 1–3 stars).
 * No ML, no backend — Q2-C's recognition engine can replace/extend later.
 */

interface DrawingFeedbackProps {
  /** Target trace path (normalized). */
  target: Stroke;
  /** All strokes the kid made (normalized). */
  strokes: Stroke[];
  onTryAgain?: () => void;
  onDone?: () => void;
}

export default function DrawingFeedback({ target, strokes, onTryAgain, onDone }: DrawingFeedbackProps) {
  const score = useMemo(() => scoreDrawing(strokes.flat(), target), [strokes, target]);
  const hasStrokes = strokes.flat().length > 0;

  if (!hasStrokes) return null;

  const passed = score.stars >= 2;

  return (
    <div className={`mx-auto mt-4 max-w-md rounded-3xl border p-5 text-center shadow-lg backdrop-blur-xl ${
      passed ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60' : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60'
    }`}>
      <div className="text-5xl">{score.emoji}</div>
      <div className="mt-2 flex items-center justify-center gap-1">
        {[1, 2, 3].map((n) => (
          <Star
            key={n}
            className={`h-7 w-7 ${n <= score.stars ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-3xl font-black text-gray-800">{score.overall}%</p>
      <p className="mt-1 text-sm font-bold text-gray-600">
        {score.stars === 3
          ? t('drawing.feedback.perfect', { defaultValue: 'Perfect tracing — you did it! 🎉' })
          : score.stars === 2
            ? t('drawing.feedback.good', { defaultValue: 'Almost perfect — great job!' })
            : t('drawing.feedback.tryMore', { defaultValue: 'Good try! Stay on the dotted line next time.' })}
      </p>

      <div className="mt-4 flex gap-2">
        {!passed && onTryAgain && (
          <button
            type="button"
            onClick={() => { playTap(); onTryAgain(); }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-600 shadow-sm transition hover:bg-amber-50 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            {t('drawing.tryAgain', { defaultValue: 'Try again' })}
          </button>
        )}
        {onDone && (
          <button
            type="button"
            onClick={() => { playTap(); onDone(); }}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-4 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 ${passed ? 'w-full' : ''}`}
          >
            {t('drawing.next', { defaultValue: 'Next shape' })}
          </button>
        )}
      </div>
    </div>
  );
}