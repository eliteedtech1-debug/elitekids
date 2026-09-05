/**
 * Low-end device detection — strips GPU-heavy CSS effects (blur, backdrop-blur,
 * CSS animations) on devices that choke on them.
 *
 * Call `applyLowEndMode()` once at app startup (or in heavy page mounts).
 * When triggered, sets `data-low-end="true"` on <html>, which the global
 * CSS (index.css) uses to neutralize .login-gpu-heavy and Tailwind blur/animation utilities.
 */

let _applied = false;

export function isLowEnd(): boolean {
  try {
    // deviceMemory: Chrome-only, values 0.25/0.5/1/2/4/8 — low ≤ 2 GB
    // @ts-ignore
    const mem = navigator.deviceMemory;
    if (typeof mem === 'number' && mem <= 2) return true;

    // CPU cores: most low-end phones have ≤ 2
    if (navigator.hardwareConcurrency <= 2) return true;

    // Small screen is a proxy for older / cheaper devices
    if (screen.width <= 360 && screen.height <= 640) return true;
  } catch {
    /* navigator may be restricted in some WebView contexts */
  }
  return false;
}

/**
 * One-shot: tag <html> with data-low-end="true" if the device is detected as
 * low-end. Safe to call multiple times (idempotent).
 */
export function applyLowEndMode(): void {
  if (_applied) return;
  _applied = true;
  if (isLowEnd()) {
    document.documentElement.setAttribute('data-low-end', 'true');
  }
}
