/**
 * SceneRenderer — visual layer for one normalized scene card.
 *
 * Layer order: background (library palette gradient + emoji wash) → characters
 * (library rig/emoji row) → scene image → subtitle text card. Narration is
 * driven by the PARENT (GamePlay already owns audio/TTS); this component only
 * renders + reports taps so a single "advance" affordance stays consistent.
 *
 * Legacy text-only cards normalise to the same v2 shape (normalizer supplies
 * the plain backdrop), so old stories keep playing unchanged.
 */
import type { NormalizedScene, SceneLibrary, SceneCharacter } from '@/lib/utils/scenes';
import { backgroundVisual, libraryEntry } from '@/lib/utils/scenes';
import CachedImg from '@/components/CachedImg';
import SpeakButton from '@/components/SpeakButton';
import { t } from '@/lib/i18n';

interface SceneRendererProps {
  scene: NormalizedScene;
  library: SceneLibrary;
  index: number;
  total: number;
  speaking?: boolean;
  /** Tap anywhere on the card advances (unless a button inside handles it). */
  onAdvance?: () => void;
  /** Checkpoint card content (button label) — rendered by the parent flow. */
  checkpointNote?: string;
}

function transitionClass(transition: NormalizedScene['transition']): string {
  switch (transition) {
    case 'slide':
      return 'animate-game-slide-up';
    case 'none':
      return '';
    case 'fade':
    default:
      return 'animate-game-pop';
  }
}

function resolveCharacter(library: SceneLibrary, c: SceneCharacter) {
  const rig = c.rigId ? libraryEntry(library, 'characters', c.rigId) : undefined;
  const image = c.image || rig?.emoji || undefined;
  const isEmoji = !c.image && !!image && image.length <= 8;
  const name = c.name || rig?.name || '';
  const emoji = isEmoji ? image : c.emoji || rig?.emoji || '🧒';
  return { image: c.image ? c.image : isEmoji ? undefined : image, emoji, name };
}

function CharacterBadge({ library, c }: { library: SceneLibrary; c: SceneCharacter }) {
  const resolved = resolveCharacter(library, c);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 border-white shadow-lg ${
          resolved.image ? 'overflow-hidden bg-white' : 'bg-blue-100'
        } ${c.position === 'left' ? 'scale-90' : c.position === 'right' ? 'scale-90' : 'scale-100'}`}
      >
        {resolved.image ? (
          <CachedImg src={resolved.image} alt={resolved.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl">{resolved.emoji}</span>
        )}
      </div>
      {resolved.name && <span className="text-[10px] font-bold text-gray-600">{resolved.name}</span>}
    </div>
  );
}

export default function SceneRenderer({
  scene,
  library,
  index,
  total,
  speaking = false,
  onAdvance,
  checkpointNote,
}: SceneRendererProps) {
  const bg = backgroundVisual(library, scene.background);
  const transition = scene.legacy ? '' : transitionClass(scene.transition);
  const isCheckpoint = scene.type === 'game_checkpoint';
  const characters = (scene.characters || []).slice(0, 4);
  const [g1, g2] = bg.palette.length === 2 ? bg.palette : ['#E7EEF6', '#ffffff'];

  return (
    <div
      onClick={onAdvance}
      className="relative w-full overflow-hidden rounded-3xl shadow-md transition-all active:scale-[0.99] cursor-pointer"
      style={{ background: `linear-gradient(160deg, ${g1} 0%, ${g2} 100%)`, minHeight: 380 }}
      role="group"
      aria-label={`Scene ${index + 1} of ${total}`}
    >
      {/* Background wash emoji */}
      {bg.emoji && (
        <div className="pointer-events-none absolute -right-4 -top-6 text-[110px] opacity-15 select-none">
          {bg.emoji}
        </div>
      )}

      {/* Step indicator */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i < index ? 'w-2 bg-green-400' : i === index ? 'w-5 bg-[#0F4D92]' : 'w-2 bg-white/70'}`} />
        ))}
      </div>
      <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-gray-500 backdrop-blur">
        {index + 1}/{total}
      </span>

      <div className={`flex min-h-[380px] flex-col items-center justify-center gap-4 px-5 py-8 ${transition}`}>
        {/* Characters */}
        {characters.length > 0 && (
          <div className="flex items-end justify-center gap-3">
            {characters.map((c, i) => (
              <CharacterBadge key={i} library={library} c={c} />
            ))}
          </div>
        )}

        {/* Scene image */}
        {scene.image && (
          <div className="max-w-sm">
            <CachedImg
              src={scene.image}
              alt={scene.text ? '' : 'scene'}
              className="max-h-56 w-auto rounded-2xl border-2 border-white object-contain shadow-lg"
              draggable={false}
            />
          </div>
        )}

        {/* Checkpoint tag */}
        {isCheckpoint && (
          <div className="rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-md">
            🎮 {t('game.story.checkpointTag')}
          </div>
        )}

        {/* Text card (subtitles) */}
        {(scene.text || speaking) && (
          <div className="w-full max-w-md">
            <div className="rounded-2xl bg-white/95 px-5 py-4 text-center shadow-lg backdrop-blur">
              <p className="text-lg font-semibold leading-relaxed text-gray-800">{scene.text}</p>
              {speaking && (
                <div className="mt-2 flex items-center justify-center gap-2 text-sm text-[#0F4D92]/70">
                  <div className="flex items-center gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0F4D92]/40 animate-game-pulse stagger-1" />
                    <span className="inline-block h-2 w-2 rounded-full bg-[#0F4D92]/60 animate-game-pulse stagger-2" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#0F4D92]/80 animate-game-pulse stagger-3" />
                  </div>
                  <span className="font-medium">{t('game.speaking')}</span>
                </div>
              )}
              <div className="mt-1 flex justify-center">
                <SpeakButton text={scene.text} size="sm" />
              </div>
            </div>
          </div>
        )}

        {/* Checkpoint note */}
        {checkpointNote && (
          <p className="rounded-xl bg-black/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
            {checkpointNote}
          </p>
        )}
      </div>
    </div>
  );
}
