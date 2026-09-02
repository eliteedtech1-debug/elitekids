import { useMemo, useState, useEffect } from 'react';
import { Plus, Trash2, Code2, Wand2, MoveUp, MoveDown, Sparkles, BookOpen } from 'lucide-react';
import { t } from '@/lib/i18n';

/* ── Scene editor ────────────────────────────────────────────────────────
   Replaces the raw-JSON scenes step with a visual editor. Each scene is a
   card of narration the student sees/hears before play. The value is kept as
   the wrapper shape the runtime actually renders:

       [ { "scenes": [ { "id": 1, "text": "...", "type": "intro" }, ... ] } ]

   The JSON string is the single source of truth (like GameConfigEditor); every
   form edit re-serializes through onJsonChange, and the Advanced tab is the
   same JSON two-way bound.
*/

type SceneType = 'intro' | 'teach' | 'reinforce' | 'match';

interface Scene {
  id: number;
  text: string;
  type: SceneType;
}

const SCENE_TYPES: SceneType[] = ['intro', 'teach', 'reinforce', 'match'];

interface SceneEditorProps {
  scenesJson: string;
  onJsonChange: (json: string) => void;
}

/** Normalize arbitrary input (raw array / wrapper / mixture) into a flat Scene[]. */
function parseScenes(json: string): Scene[] {
  if (!json.trim()) return [];
  try {
    const data = JSON.parse(json);
    // Accept a top-level array of scene objects OR a wrapper with .scenes.
    const list: any[] = Array.isArray(data)
      ? data
      : data?.scenes
      ? data.scenes
      : [];
    const scenes: Scene[] = [];
    (Array.isArray(data) ? data : []).forEach((item: any) => {
      if (Array.isArray(item)) item.forEach((s) => scenes.push(normalizeScene(s)));
      else if (item && Array.isArray(item.scenes)) item.scenes.forEach((s: any) => scenes.push(normalizeScene(s)));
      else if (item && typeof item === 'object') scenes.push(normalizeScene(item));
    });
    return scenes;
  } catch {
    return [];
  }
}

function normalizeScene(s: any): Scene {
  const text = s?.text ?? s?.narration ?? '';
  const type: SceneType = ['intro', 'teach', 'reinforce', 'match'].includes(s?.type)
    ? s.type
    : ['intro', 'teach', 'reinforce', 'match'].includes(s?.sceneType)
    ? s.sceneType
    : 'intro';
  return { id: Number(s?.id) || 0, text: String(text), type };
}

function serialize(scenes: Scene[]): string {
  // Wrap in the runtime shape: [ { scenes: [...] } ]. Cards are preserved even
  // when text is blank so the editor is stable while typing; empty-text cards
  // are filtered out on submit (see GameCreator.handleSubmit).
  const wrapped = scenes.map((s, i) => ({ id: i + 1, text: s.text, type: s.type }));
  return JSON.stringify([{ scenes: wrapped }], null, 2);
}

export default function SceneEditor({ scenesJson, onJsonChange }: SceneEditorProps) {
  const [tab, setTab] = useState<'visual' | 'advanced'>('visual');
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

  const patch = (next: Scene[]) => onJsonChange(serialize(next));

  const updateScene = (idx: number, patchFn: (s: Scene) => Scene) => {
    const next = scenes.map((s, i) => (i === idx ? patchFn(s) : s));
    patch(next);
  };

  const addScene = () => {
    patch([...scenes, { id: scenes.length + 1, text: '', type: 'intro' }]);
  };

  const removeScene = (idx: number) => {
    patch(scenes.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[idx], next[target]] = [next[target], next[idx]];
    patch(next);
  };

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

      {tab === 'visual' ? (
        <div>
          <p className="mb-3 text-xs text-gray-400">{t('gameSceneEditor.visualHint')}</p>

          {scenes.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[#0d9488]/20 bg-gradient-to-br from-[#0d9488]/5 via-teal-50 to-emerald-50 p-8 text-center">
              <BookOpen className="mx-auto mb-3 h-8 w-8 text-[#0d9488]/50" />
              <p className="text-sm text-gray-500">{t('gameSceneEditor.noScenes')}</p>
              <button
                type="button"
                onClick={addScene}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b3d76] active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" /> {t('gameSceneEditor.addScene')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {scenes.map((scene, idx) => (
                <div key={idx} className="relative rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      {t('gameSceneEditor.scenePrefix')} {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30"
                      >
                        <MoveUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        disabled={idx === scenes.length - 1}
                        title="Move down"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30"
                      >
                        <MoveDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeScene(idx)}
                        title={t('common.remove')}
                        className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <label className="mb-1 block text-xs font-semibold text-gray-600">
                    {t('gameSceneEditor.text')}
                  </label>
                  <textarea
                    value={scene.text}
                    onChange={(e) => updateScene(idx, (s) => ({ ...s, text: e.target.value }))}
                    rows={2}
                    placeholder={t('gameSceneEditor.textPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                  />

                  <label className="mb-1 mt-3 block text-xs font-semibold text-gray-600">
                    {t('gameSceneEditor.typeLabel')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SCENE_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateScene(idx, (s) => ({ ...s, type }))}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                          scene.type === type
                            ? 'bg-[#0F4D92] text-white shadow'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {t(`gameSceneEditor.type.${type}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addScene}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-[#0F4D92]/40 hover:bg-blue-50/50 hover:text-[#0F4D92]"
              >
                <Plus className="h-4 w-4" /> {t('gameSceneEditor.addScene')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-gray-400">{t('gameEditor.advancedHint')}</p>
          <textarea
            value={scenesJson}
            onChange={(e) => onJsonChange(e.target.value)}
            rows={12}
            spellCheck={false}
            className={`w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 ${
              isValid
                ? 'border-gray-200 focus:border-[#0F4D92] focus:ring-[#0F4D92]/30'
                : 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200'
            }`}
          />
          {!isValid && <p className="mt-2 text-xs text-red-500">{t('gameEditor.fixJsonToContinue')}</p>}
        </div>
      )}
    </div>
  );
}
