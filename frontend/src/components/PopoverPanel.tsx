import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * PopoverPanel — dropdown/popover rendered through a React portal to
 * document.body so NO parent stacking context (backdrop-blur, transform,
 * filter, overflow, z-index) can ever trap or clip it. This is the systemic
 * fix for header dropdowns hiding behind page backgrounds: a panel portaled
 * to <body> competes in the ROOT stacking context, where only z-index
 * decides paint order.
 *
 * Positioning: measured against the trigger (top just below it, right edges
 * aligned, clamped to the viewport) and recomputed on scroll (capture phase,
 * so inner scroll containers count) and resize. On small screens it renders
 * as a full-width sheet docked below the header — same UX as the old fixed
 * panels, now impossible to clip or trap.
 *
 * Outside interaction: `pointerdown` outside both the panel and the trigger
 * closes (mouse + touch both emit pointer events); Escape closes. The
 * trigger toggling itself stays the owner component's onClick.
 *
 * Z-index contract (root stacking context):
 *   header rows z-30 · live bar z-40 · modals z-50/60 · StudentQuickNav z-[60]
 *   · THIS panel z-[70] — dropdowns above page chrome, below nothing they
 *   need; AppSwitcher's consent modal (inline z 1000000) still tops all.
 *
 * Padding/radius/width are caller-controlled via `panelClassName` so each
 * dropdown keeps its original look (avoids Tailwind same-specificity
 * conflicts like p-4 vs p-5 in one class string).
 */

const PANEL_Z = 70;

interface PopoverPanelProps {
  open: boolean;
  onClose: () => void;
  /** Element the panel anchors to (the trigger's wrapper). */
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Width / padding / radius classes, e.g. 'w-72 p-4 rounded-2xl'. */
  panelClassName?: string;
  /** aria-label for the panel container. */
  ariaLabel?: string;
}

export default function PopoverPanel({
  open,
  onClose,
  anchorRef,
  children,
  panelClassName = 'w-72 p-4 rounded-2xl',
  ariaLabel,
}: PopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right?: number } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    if (vw < 640) {
      // Mobile sheet: full-width-ish, just below the trigger/header.
      setPos({ top: Math.max(56, r.bottom + 4), left: 12, right: 12 });
      return;
    }
    // Desktop: top under the trigger, right edges aligned, viewport-clamped.
    const panelW = panelRef.current?.offsetWidth || 288;
    const left = Math.max(8, Math.min(r.right - panelW, vw - panelW - 8));
    setPos({ top: r.bottom + 6, left });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Close on outside pointerdown (capture) + Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return; // trigger handles its own toggle
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  const isMobile = window.innerWidth < 640;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, right: pos.right, zIndex: PANEL_Z }
          : { position: 'fixed', top: 56, left: 12, right: 12, zIndex: PANEL_Z } // first frame, pre-measure
      }
      className={`border border-gray-200 bg-white shadow-lg ${panelClassName}`}
    >
      {children}
    </div>,
    document.body,
  );
}
