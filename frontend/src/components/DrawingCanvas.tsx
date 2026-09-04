import { useCallback, useEffect, useRef, useState } from 'react';
import { Undo2, Eraser } from 'lucide-react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';

/**
 * DrawingCanvas (Q2 drawing FE leaf, Q26).
 *
 * Pure browser Canvas 2D drawing surface — DPR-aware, sized by its container,
 * pointer events (mouse + touch). Emits completed strokes via onStroke as
 * normalized 0–1 points (see lib/utils/drawing.ts) so parents can compare
 * against trace paths without knowing pixel sizes. NO backend, NO ML.
 */

export interface RawPoint {
  x: number;
  y: number;
}

interface DrawingCanvasProps {
  /** Called with each completed stroke (normalized 0–1 points). */
  onStroke?: (stroke: RawPoint[]) => void;
  /** Lock the surface (e.g. while grading). */
  disabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  /** Render a clear/undo toolbar above the surface. */
  showToolbar?: boolean;
  className?: string;
}

interface LocalStroke {
  points: RawPoint[];
  color: string;
  width: number;
}

export default function DrawingCanvas({
  onStroke,
  disabled = false,
  strokeColor = '#0d9488',
  strokeWidth = 6,
  showToolbar = true,
  className = '',
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<LocalStroke[]>([]);
  const drawingRef = useRef(false);
  const currentRef = useRef<RawPoint[]>([]);
  const colorRef = useRef(strokeColor);
  const widthRef = useRef(strokeWidth);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const [size, setSize] = useState({ w: 0, h: 0 });

  colorRef.current = strokeColor;
  widthRef.current = strokeWidth;

  // Keep the canvas sized to its container, DPR-aware.
  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = Math.max(200, el.clientHeight || w * 0.72);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
      sizeRef.current = { w, h };
      dprRef.current = dpr;
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw everything whenever strokes change or the surface resizes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = p.x * sizeRef.current.w;
        const y = p.y * sizeRef.current.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [strokes, size]);

  const toNormalized = useCallback((clientX: number, clientY: number): RawPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    if (!w || !h) return null;
    return {
      x: (clientX - rect.left) / w,
      y: (clientY - rect.top) / h,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      const p = toNormalized(e.clientX, e.clientY);
      if (!p) return;
      drawingRef.current = true;
      currentRef.current = [p];
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = widthRef.current;
        ctx.beginPath();
        ctx.moveTo(p.x * sizeRef.current.w, p.y * sizeRef.current.h);
      }
    },
    [disabled, toNormalized],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || disabled) return;
      const p = toNormalized(e.clientX, e.clientY);
      if (!p) return;
      const last = currentRef.current[currentRef.current.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return; // throttle dots
      currentRef.current.push(p);
      // live ink: draw each segment as its own beginPath so nothing re-strokes
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx && last) {
        ctx.strokeStyle = colorRef.current;
        ctx.lineWidth = widthRef.current;
        ctx.beginPath();
        ctx.moveTo(last.x * sizeRef.current.w, last.y * sizeRef.current.h);
        ctx.lineTo(p.x * sizeRef.current.w, p.y * sizeRef.current.h);
        ctx.stroke();
      }
    },
    [disabled, toNormalized],
  );

  const endStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentRef.current;
    currentRef.current = [];
    if (pts.length < 2) return;
    const stroke: LocalStroke = { points: pts, color: colorRef.current, width: widthRef.current };
    setStrokes((s) => [...s, stroke]);
    onStroke?.(pts);
  }, [onStroke]);

  const clear = useCallback(() => {
    playTap();
    setStrokes([]);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const undo = useCallback(() => {
    playTap();
    setStrokes((s) => s.slice(0, -1));
  }, []);

  return (
    <div ref={wrapRef} className={`w-full ${className}`}>
      {showToolbar && (
        <div className="mb-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!strokes.length || disabled}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t('drawing.undo', { defaultValue: 'Undo' })}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!strokes.length || disabled}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
            {t('drawing.clear', { defaultValue: 'Clear' })}
          </button>
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-teal-200 bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className={`block touch-none ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-crosshair'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          aria-label={t('drawing.surfaceLabel', { defaultValue: 'Drawing surface' })}
        />
      </div>
    </div>
  );
}