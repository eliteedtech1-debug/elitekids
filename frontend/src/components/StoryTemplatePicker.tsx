/**
 * StoryTemplatePicker — loads per-game-type story scaffolds from the backend
 * (GET /kids/story-templates?template=) and applies one to the SceneEditor as
 * a starting point (hook → teach → … → checkpoint → recap). The teacher then
 * personalises the placeholder words ({Character}, {topic}, {stage1}…).
 *
 * Built-in scaffold fallbacks ship locally so the picker works offline or
 * when the staff endpoint is unreachable.
 */
import { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, Loader2 } from 'lucide-react';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export interface StoryTemplate {
  template: string;
  label?: string;
  arc?: string[];
  scaffolds?: { type: string; text: string; durationSec?: number; transition?: string; gameId?: string }[];
  glue?: string[];
}

const FALLBACK_ARC = [
  { type: 'intro', text: '{Character} needs help with {topic}!', durationSec: 8, transition: 'fade' },
  { type: 'teach', text: 'Here is how {topic} works.', durationSec: 10, transition: 'slide' },
  { type: 'reinforce', text: 'Let us practise with {topic} together.', durationSec: 8, transition: 'fade' },
  { type: 'game_checkpoint', text: 'Now it is your turn — play the {topic} game!', durationSec: 6, transition: 'fade', gameId: '' },
  { type: 'recap', text: 'You did it! {topic} is fun when you try!', durationSec: 8, transition: 'fade' },
];

interface StoryTemplatePickerProps {
  gameTemplate?: string;
  onApply: (scaffolds: StoryTemplate['scaffolds']) => void;
}

export default function StoryTemplatePicker({ gameTemplate, onApply }: StoryTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    apiClient
      .get(ENDPOINTS.STORY.TEMPLATES(gameTemplate))
      .then((res) => {
        const data = res.data?.data;
        if (Array.isArray(data) && data.length > 0) setTemplates(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, gameTemplate, templates.length]);

  const pick = (tpl: StoryTemplate) => {
    const scaffolds = (tpl.scaffolds?.length ? tpl.scaffolds : FALLBACK_ARC).map((s) => ({
      type: s.type,
      text: s.text,
      ...(s.durationSec ? { durationSec: s.durationSec } : {}),
      ...(s.transition ? { transition: s.transition } : {}),
      ...(s.type === 'game_checkpoint' ? { gameId: s.gameId || '' } : {}),
    }));
    onApply(scaffolds);
    setApplied(true);
    setOpen(false);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-all hover:bg-indigo-100 active:scale-95"
      >
        <Sparkles className="h-3.5 w-3.5" /> {t('sceneEditor.storyOutline')}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {applied && (
        <span className="ml-2 text-xs font-medium text-green-600 animate-game-pop">
          ✓ {t('sceneEditor.outlineApplied')}
        </span>
      )}

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 text-[11px] text-gray-400">{t('sceneEditor.outlineHint')}</p>
          {loading ? (
            <p className="flex items-center gap-2 px-2 py-3 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('sceneEditor.loadingOutlines')}
            </p>
          ) : templates.length === 0 ? (
            <button
              type="button"
              onClick={() => pick({ template: gameTemplate || 'generic' })}
              className="block w-full rounded-xl px-2 py-2 text-left text-xs font-medium text-gray-700 hover:bg-indigo-50"
            >
              {gameTemplate ? t('sceneEditor.outlineDefault') : 'Classic story arc'} —{' '}
              <span className="text-[10px] text-gray-400">{FALLBACK_ARC.length} cards</span>
            </button>
          ) : (
            templates.map((tpl) => (
              <button
                key={tpl.template}
                type="button"
                onClick={() => pick(tpl)}
                className="block w-full rounded-xl px-2 py-2 text-left hover:bg-indigo-50"
              >
                <span className="block text-xs font-semibold text-gray-700">
                  {tpl.label || tpl.template}
                </span>
                <span className="block text-[10px] text-gray-400">
                  {tpl.arc?.join(' → ') || `${tpl.scaffolds?.length || 0} cards`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
