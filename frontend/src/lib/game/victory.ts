/**
 * Victory Ceremony — boss defeat celebration + tug/tournament end.
 * Confetti + stats + badge award + wisdom quote.
 */

export interface VictoryData {
  type: 'boss_defeated' | 'tug_won' | 'tournament_won' | 'festival_complete';
  title: string;
  subtitle?: string;
  wisdom?: string;
  badge?: string;
  stats?: {
    score?: number;
    accuracy?: number;
    speed?: number;
    combo_max?: number;
    damage_dealt?: number;
    questions_answered?: number;
    questions_correct?: number;
  };
}

/** Confetti particle system — lightweight canvas overlay. */
export function launchConfetti(container: HTMLElement, duration = 3000) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; rot: number; rotSpeed: number }[] = [];
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FF8A65', '#BA68C8'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    });
  }

  const start = performance.now();
  function frame(now: number) {
    const elapsed = now - start;
    if (elapsed > duration || !ctx) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.rot += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - elapsed / duration;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Screen shake effect — applied to a container. */
export function screenShake(container: HTMLElement, intensity = 5, duration = 300) {
  const start = performance.now();
  function shake(now: number) {
    const elapsed = now - start;
    if (elapsed > duration) {
      container.style.transform = '';
      return;
    }
    const decay = 1 - elapsed / duration;
    const x = (Math.random() - 0.5) * intensity * decay;
    const y = (Math.random() - 0.5) * intensity * decay;
    container.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(shake);
  }
  requestAnimationFrame(shake);
}

/** Floating reaction animation — emoji floats up and fades. */
export function floatReaction(
  container: HTMLElement,
  emoji: string,
  x: number,
  y: number,
) {
  const el = document.createElement('div');
  el.textContent = emoji;
  el.style.cssText = `
    position:absolute; left:${x}px; top:${y}px;
    font-size:24px; pointer-events:none; z-index:100;
    transition: all 1.5s ease-out;
  `;
  container.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = `translateY(-80px) scale(1.5)`;
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1600);
}
