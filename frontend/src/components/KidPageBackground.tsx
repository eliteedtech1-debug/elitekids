/**
 * KidPageBackground — shared decorative gradient + floating shapes
 * for all kid-facing pages, matching the login page's 3D claymorphism style.
 */
export default function KidPageBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
      {/* Main gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0fdfa] via-[#e0f7ef] to-[#fef3c7]" />
      {/* Large teal blob top-left */}
      <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-gradient-to-br from-teal-400/30 to-emerald-500/20 blur-3xl animate-pulse" />
      {/* Amber accent mid-right */}
      <div className="absolute top-1/3 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-400/25 to-orange-400/15 blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
      {/* Navy blob bottom-left */}
      <div className="absolute bottom-10 -left-10 h-40 w-40 rounded-full bg-gradient-to-br from-[#0F4D92]/15 to-[#0d9488]/10 blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />
      {/* Floating book */}
      <svg className="absolute top-[12%] left-[8%] h-10 w-10 text-teal-300/30 animate-bounce" style={{ animationDuration: '3s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM4 6h7v12H4V6zm9 12V6h7v12h-7z"/>
      </svg>
      {/* Floating star */}
      <svg className="absolute top-[55%] left-[4%] h-7 w-7 text-amber-300/40 animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      {/* Floating pencil */}
      <svg className="absolute top-[20%] right-[10%] h-9 w-9 text-emerald-300/25 animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1.5s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
      {/* Small circle */}
      <div className="absolute bottom-[18%] right-[6%] h-5 w-5 rounded-full bg-teal-400/25 animate-pulse" style={{ animationDelay: '2s' }} />
      {/* Tiny sparkle */}
      <svg className="absolute top-[40%] left-[50%] h-5 w-5 text-purple-300/20 animate-bounce" style={{ animationDuration: '5s', animationDelay: '2.5s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"/>
      </svg>
    </div>
  );
}
