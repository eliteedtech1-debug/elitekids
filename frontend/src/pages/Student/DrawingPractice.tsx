import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import TracingGuide from '@/components/TracingGuide';
import DrawingFeedback from '@/components/DrawingFeedback';
import { DEMO_TRACES, TRACE_PATHS, type Stroke } from '@/lib/utils/drawing';

/**
 * Drawing dev harness (Q2 drawing FE leaf, Q26) — /student/drawing?mode=demo.
 * Built-in shapes/digits traced on a ghost guide, scored by DrawingFeedback.
 * Teacher templates land with Q2-D; recognition plugs in at Q2-C.
 */

export default function DrawingPractice() {
  const [params] = useSearchParams();
  const mode = params.get('mode') || 'demo';
  const [traceIdx, setTraceIdx] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [checked, setChecked] = useState(false);

  const traceKey = DEMO_TRACES[traceIdx % DEMO_TRACES.length];
  const target: Stroke = TRACE_PATHS[traceKey] || [];

  const nextTrace = () => {
    playTap();
    setTraceIdx((i) => i + 1);
    setStrokes([]);
    setChecked(false);
  };

  const tryAgain = () => {
    playTap();
    setStrokes([]);
    setChecked(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-teal-50 px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-center text-lg font-black text-gray-800">{t('drawing.title', { defaultValue: 'Trace It!' })}</h1>
        <p className="mb-4 text-center text-xs font-semibold text-violet-600/80">
          {t('drawing.subtitle', { defaultValue: 'Draw over the dotted line — stay on it!' })}
        </p>

        {!checked ? (
          <>
            <TracingGuide
              path={target}
              onStrokes={setStrokes}
              label={traceKey}
              key={traceKey}
            />
            <button
              type="button"
              disabled={strokes.flat().length < 3}
              onClick={() => { playTap(); setChecked(true); }}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-[#0d9488] py-3 text-sm font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              {t('drawing.check', { defaultValue: 'How did I do? ✨' })}
            </button>
          </>
        ) : (
          <>
            <DrawingFeedback target={target} strokes={strokes} onTryAgain={tryAgain} onDone={nextTrace} />
            <button
              type="button"
              onClick={tryAgain}
              className="mt-2 w-full rounded-2xl border-2 border-violet-200 bg-white py-2.5 text-xs font-black text-violet-600 transition hover:bg-violet-50 active:scale-95"
            >
              {t('drawing.redraw', { defaultValue: 'Redraw this one' })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}