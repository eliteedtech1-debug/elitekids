/**
 * SceneEditor — visual editor for illustrated story scenes (canonical v2).
 *
 * Each card now carries the v2 visual fields: image URL, approved background,
 * characters (from /kids/scene-library with built-in fallbacks), transition,
 * auto-advance duration, and the full type set (intro/teach/reinforce/recap/
 * game_checkpoint — checkpoints link an embedded game by lesson id). Legacy
 * aliases are tolerated on read; the editor always emits canonical v2.
 *
 * The JSON string is the single source of truth (like GameConfigEditor); the
 * wrapper shape [ { scenes: [...] } ] is preserved for the runtime + submit.
 */
import { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Code2, Wand2, MoveUp, MoveDown, Sparkles, BookOpen, ImageIcon } from 'lucide-react';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import MediaPicker from '@/components/MediaPicker';
import StoryTemplatePicker from '@/components/StoryTemplatePicker';
import { normalizeScene, SCENE_TYPES, DEFAULT_BACKGROUNDS, DEFAULT_CHARACTERS, DEFAULT_TRANSITIONS } from '@/lib/utils/scenes';
import type { SceneLibrary, NormalizedScene } from '@/lib/utils/scenes';

type EditableScene = NormalizedScene;

interface SceneEditorProps {
  scenesJson: string;
  onJsonChange: (json: string) => void;
  /** Game template (when opened from GameCreator) — used by the story picker. */
  gameTemplate?: string;
}

/** Parse + normalize any input shape into EditableScene[]. */
function parseScenes(json: string): EditableScene[] {
  if (!json.trim()) return [];
  try {
    const data = JSON.parse(json);
    const list: any[] = Array.isArray(data) ? data : data?.scenes ? data.scenes : [];
    const scenes: any[] = [];
    list.forEach((item: any) => {
      if (Array.isArray(item)) item.forEach((s) => scenes.push(s));
      else if (item && Array.isArray(item.scenes)) item.scenes.forEach((s: any) => scenes.push(s));
      else if (item && typeof item === 'object') scenes.push(item);
    });
    return scenes.map((s, i) => {
      const norm = normalizeScene(s);
      return { ...norm, id: norm.id || String(i + 1) };
    });
  } catch {
    return [];
  }
}

function serialize(scenes: EditableScene[]): string {
  const cards = scenes.map((s, i) => {
    const card: Record<string, any> = {
      type: s.type,
      text: s.text,
      id: Number.isNaN(Number(s.id)) ? i + 1 : Number(s.id) || i + 1,
    };
    if (s.image) card.image = s.image;
    if (s.background) card.background = s.background;
    if (s.characters?.length) {
      card.characters = s.characters.map((c) => ({
        name: c.name,
        ...(c.emoji ? { emoji: c.emoji } : {}),
        ...(c.image ? { image: c.image } : {}),
        ...(c.rigId ? { rigId: c.rigId } : {}),
        ...(c.animation && c.animation !== 'idle' ? { animation: c.animation } : {}),
        ...(c.position && c.position !== 'center' ? { position: c.position } : {}),
      }));
    }
    if (s.narrationAudio) card.narrationAudio = s.narrationAudio;
    if (typeof s.durationSec === 'number' && s.durationSec >= 3) card.durationSec = Math.min(60, s.durationSec);
    if (s.transition && s.transition !== 'fade') card.transition = s.transition;
    if (s.subtitles === false) card.subtitles = false;
    if (s.type === 'game_checkpoint') card.gameId = s.gameId || '';
    return card;
  });
  return JSON.stringify([{ scenes: cards }], null, 2);
}

const LIBRARY_FALLBACK: SceneLibrary = {
  backgrounds: DEFAULT_BACKGROUNDS,
  characters: DEFAULT_CHARACTERS,
  transitions: DEFAULT_TRANSITIONS,
};

export default function SceneEditor({ scenesJson, onJsonChange, gameTemplate }: SceneEditorProps) {
  const [tab, setTab] = useState<'visual' | 'advanced'>('visual');
  const [library, setLibrary] = useState<SceneLibrary>(LIBRARY_FALLBACK);

  // Approved art library — pickers degrade to the built-in defaults offline.
  useEffect(() => {
    apiClient
      .get(ENDPOINTS.STORY.SCENE_LIBRARY)
      .then((res) => {
        const data = res.data?.data || {};
        if (data && typeof data === 'object') {
          setLibrary({
            backgrounds: data.backgrounds || LIBRARY_FALLBACK.backgrounds,
            characters: data.characters || LIBRARY_FALLBACK.characters,
            transitions: data.transitions || LIBRARY_FALLBACK.transitions,
          });
        }
      })
      .catch(() => {});
  }, []);

  const isValid = useMemo(() => {
    try {
      JSON.parse(scenesJson);
      return true;
    } catch {
      return false;
    }
  }, [scenesJson]);

  const scenes = useMemo(() => parseScenes(scenesJson), [scenesJson]);

  useEffect(() => {
    // If JSON is invalid while on the visual tab, fall back to Advanced so the
    // teacher can see and fix the error.
    if (!isValid && tab === 'visual' && scenesJson.trim()) setTab('advanced');
  }, [isValid, tab, scenesJson]);

  const patch = (next: EditableScene[]) => onJsonChange(serialize(next));

  const updateScene = (idx: number, patchFn: (s: EditableScene) => EditableScene) => {
    patch(scenes.map((s, i) => (i === idx ? patchFn(s) : s)));
  };

  const addScene = (type: EditableScene['type'] = 'teach') => {
    patch([...scenes, normalizeScene({ type, text: '', transition: 'fade' })]);
  };

  const removeScene = (idx: number) => patch(scenes.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[idx], next[target]] = [next[target], next[idx]];
    patch(next);
  };

  const backgrounds = library.backgrounds || [];
  const characters = library.characters || [];
  const transitions = library.transitions || DEFAULT_TRANSITIONS;

  /* ── Visual editor ── */
  const visual = (
    <div>
      <p className="mb-3 text-xs text-gray-400">{t('gameSceneEditor.visualHint')}</p>

      {/* Story outline — one-tap scaffold arc per game type */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
        <span className="text-xs font-medium text-indigo-700">{t('sceneEditor.outlineBar')}</span>
        <StoryTemplatePicker
          gameTemplate={gameTemplate}
          onApply={(scaffolds) => {
            const cards = (scaffolds || []).map((s) =>
              normalizeScene({
                type: s.type,
                text: s.text,
                durationSec: s.durationSec,
                transition: s.transition,
                ...(s.type === 'game_checkpoint' ? { gameId: s.gameId || '' } : {}),
              }),
            );
            if (cards.length > 0) patch(cards);
          }}
        />
      </div>

      {scenes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#0d9488]/20 bg-gradient-to-br from-[#0d9488]/5 via-teal-50 to-emerald-50 p-8 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-[#0d9488]/50" />
          <p className="text-sm text-gray-500">{t('gameSceneEditor.noScenes')}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => addScene('intro')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b3d76] active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" /> {t('gameSceneEditor.addScene')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, idx) => {
            const bgEntry = backgrounds.find((b) => b.key === scene.background);
            return (
              <div key={idx} className="relative rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {t('gameSceneEditor.scenePrefix')} {idx + 1}
                    {bgEntry && <span className="ml-2 normal-case text-teal-600">· {bgEntry.emoji} {bgEntry.label}</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30">
                      <MoveUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === scenes.length - 1} title="Move down" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30">
                      <MoveDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeScene(idx)} title={t('common.remove')} className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Type + transition + duration row */}
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('gameSceneEditor.typeLabel')}</label>
                    <select
                      value={scene.type}
                      onChange={(e) => updateScene(idx, (s) => ({ ...s, type: e.target.value as EditableScene['type'] }))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none"
                    >
                      {SCENE_TYPES.map((tp) => (
                        <option key={tp} value={tp}>{t(`gameSceneEditor.type.${tp}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('sceneEditor.transition')}</label>
                    <select
                      value={scene.transition || 'fade'}
                      onChange={(e) => updateScene(idx, (s) => ({ ...s, transition: e.target.value as EditableScene['transition'] }))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none"
                    >
                      {transitions.map((tr) => (
                        <option key={tr.key} value={tr.key}>{tr.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('sceneEditor.durationSec')}</label>
                    <input
                      type="number"
                      min={3}
                      max={60}
                      value={scene.durationSec ?? ''}
                      onChange={(e) => updateScene(idx, (s) => ({ ...s, durationSec: e.target.value ? Math.max(3, Math.min(60, Number(e.target.value))) : undefined }))}
                      placeholder="auto"
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none"
                    />
                  </div>
                  {scene.type === 'game_checkpoint' ? (
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('sceneEditor.linkGame')}</label>
                      <input
                        type="text"
                        value={scene.gameId || ''}
                        onChange={(e) => updateScene(idx, (s) => ({ ...s, gameId: e.target.value }))}
                        placeholder="lesson id…"
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold text-gray-500">Subtitles</label>
                      <button
                        type="button"
                        onClick={() => updateScene(idx, (s) => ({ ...s, subtitles: !s.subtitles }))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        {scene.subtitles ? '✓ on' : 'off'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Narration text */}
                <label className="mb-1 block text-xs font-semibold text-gray-600">{t('gameSceneEditor.text')}</label>
                <textarea
                  value={scene.text}
                  onChange={(e) => updateScene(idx, (s) => ({ ...s, text: e.target.value }))}
                  rows={2}
                  placeholder={t('gameSceneEditor.textPlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                />

                {/* Visual fields */}
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="flex w-28 items-center gap-1 text-[10px] font-semibold text-gray-500">
                      <ImageIcon className="h-3 w-3" /> {t('sceneEditor.imageUrl')}
                    </label>
                    <div className="flex-1">
                      <MediaPicker
                        value={scene.image || ''}
                        onChange={(v) => updateScene(idx, (s) => ({ ...s, image: v }))}
                      />
                    </div>
                    {scene.image && (
                      <img src={scene.image} alt="" className="h-10 w-10 rounded-lg border border-gray-200 object-cover" />
                    )}
                  </div>

                  {/* Background picker chips */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('sceneEditor.background')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateScene(idx, (s) => ({ ...s, background: undefined }))}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                          !scene.background ? 'border-[#0F4D92] bg-[#0F4D92] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        🌫 none
                      </button>
                      {backgrounds.map((b) => (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => updateScene(idx, (s) => ({ ...s, background: b.key }))}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                            scene.background === b.key ? 'border-[#0F4D92] bg-[#0F4D92] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-[#0F4D92]/40'
                          }`}
                        >
                          {b.emoji} {b.label.split('—')[0].trim()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Character picker */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-gray-500">{t('sceneEditor.characters')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {scene.characters?.map((c, ci) => (
                        <span key={ci} className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700">
                          {c.emoji || c.image ? <span>{c.emoji || '🖼️'}</span> : null} {c.name}
                          <button
                            type="button"
                            onClick={() => updateScene(idx, (s) => ({ ...s, characters: (s.characters || []).filter((_, i) => i !== ci) }))}
                            className="text-blue-300 hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {characters.slice(0, (scene.characters?.length || 0) >= 4 ? 0 : 16).map((ch) => {
                        const added = (scene.characters || []).some((c) => c.rigId === ch.key || c.name === ch.name);
                        if (added) return null;
                        return (
                          <button
                            key={ch.key}
                            type="button"
                            disabled={(scene.characters?.length || 0) >= 4}
                            onClick={() =>
                              updateScene(idx, (s) => ({
                                ...s,
                                characters: [
                                  ...(s.characters || []),
                                  {
                                    name: ch.name,
                                    emoji: ch.emoji,
                                    rigId: ch.key,
                                    animation: ch.defaultAnimation || 'idle',
                                    position: (ch.defaultPosition || 'center') as 'center' | 'left' | 'right',
                                  },
                                ],
                              }))
                            }
                            className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-all hover:border-[#0F4D92]/50 hover:text-[#0F4D92] disabled:opacity-40"
                          >
                            + {ch.emoji} {ch.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addScene('teach')}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-[#0F4D92]/40 hover:bg-blue-50/50 hover:text-[#0F4D92]"
            >
              <Plus className="h-4 w-4" /> {t('gameSceneEditor.addScene')}
            </button>
            {(['intro', 'reinforce', 'recap', 'game_checkpoint'] as const).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => addScene(tp)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:border-[#0F4D92]/40 hover:text-[#0F4D92]"
              >
                + {t(`gameSceneEditor.type.${tp}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Advanced JSON tab ── */
  const advanced = (
    <div>
      <p className="mb-2 text-xs text-gray-400">{t('gameEditor.advancedHint')}</p>
      <textarea
        value={scenesJson}
        onChange={(e) => onJsonChange(e.target.value)}
        rows={14}
        spellCheck={false}
        className={`w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 ${
          isValid
            ? 'border-gray-200 focus:border-[#0F4D92] focus:ring-[#0F4D92]/30'
            : 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200'
        }`}
      />
      {!isValid && <p className="mt-2 text-xs text-red-500">{t('gameEditor.fixJsonToContinue')}</p>}
    </div>
  );

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('visual')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
            tab === 'visual' ? 'bg-[#0F4D92] text-white shadow' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Wand2 className="h-4 w-4" /> {t('gameEditor.easyMode')}
        </button>
        <button
          type="button"
          onClick={() => setTab('advanced')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
            tab === 'advanced' ? 'bg-[#0F4D92] text-white shadow' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Code2 className="h-4 w-4" /> {t('gameEditor.advancedJson')}
        </button>
        {tab === 'visual' && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
            <Sparkles className="h-3 w-3" /> {t('gameEditor.noCodeNeeded')}
          </span>
        )}
      </div>

      {tab === 'visual' ? visual : advanced}
    </div>
  );
}
