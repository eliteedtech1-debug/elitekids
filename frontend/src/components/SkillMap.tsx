import { t } from '@/lib/i18n';

/**
 * SkillMap (Q2-E portfolio FE leaf, Q29).
 *
 * Renders the portfolio skill map (from GET /kids/portfolio/:childId):
 * mastery bands per skill (new → mastered), a summary row, and the
 * deterministic recommendations the backend computed. Child + parent safe.
 */

export interface PortfolioSkill {
  skill_key: string;
  mastery_probability: number;
  mastery_pct: number;
  mastery_state: 'new' | 'learning' | 'practicing' | 'nearly_there' | 'mastered';
  difficulty: number;
  total_attempts: number;
  last_practiced_at?: string | null;
}

export interface SkillSummary {
  total: number;
  mastered: number;
  nearly_there: number;
  practicing: number;
  learning: number;
  new: number;
}

export interface PortfolioRecommendation {
  type: 'support' | 'focus' | 'strength' | 'celebrate';
  skill_key: string | null;
  mastery_pct: number;
  note: string;
}

const STATE_META: Record<PortfolioSkill['mastery_state'], { label: string; bar: string; chip: string; emoji: string }> = {
  new: { label: 'New', bar: 'bg-gray-300', chip: 'bg-gray-100 text-gray-600', emoji: '🌱' },
  learning: { label: 'Learning', bar: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700', emoji: '🌿' },
  practicing: { label: 'Practicing', bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', emoji: '💪' },
  nearly_there: { label: 'Almost there', bar: 'bg-orange-400', chip: 'bg-orange-50 text-orange-700', emoji: '🔥' },
  mastered: { label: 'Mastered', bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', emoji: '🌟' },
};

interface SkillMapProps {
  skills: PortfolioSkill[];
  summary: SkillSummary;
  recommendations: PortfolioRecommendation[];
  /** Compact = single-column stack for narrow cards (default list). */
  compact?: boolean;
}

export default function SkillMap({ skills, summary, recommendations, compact = false }: SkillMapProps) {
  if (!skills.length) {
    return (
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-2xl">🌱</p>
        <p className="mt-1 text-sm font-bold text-gray-600">
          {t('portfolio.skillMap.empty', { defaultValue: 'No skills yet — play your first game to grow the map!' })}
        </p>
      </div>
    );
  }

  const sorted = [...skills].sort((a, b) => b.mastery_pct - a.mastery_pct);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
          🗺️ {t('portfolio.skillMap.title', { defaultValue: 'Skill Map' })}
        </h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-black text-emerald-600">{summary.mastered}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.skillMap.mastered', { defaultValue: 'Mastered' })}</p>
          </div>
          <div>
            <p className="text-lg font-black text-orange-500">{summary.nearly_there}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.skillMap.nearlyThere', { defaultValue: 'Almost' })}</p>
          </div>
          <div>
            <p className="text-lg font-black text-gray-700">{summary.total}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.skillMap.total', { defaultValue: 'Total skills' })}</p>
          </div>
        </div>
      </div>

      {/* Skill rows */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
          {sorted.map((s) => {
            const meta = STATE_META[s.mastery_state] || STATE_META.new;
            const display = s.skill_key.split('.').pop() || s.skill_key;
            return (
              <div key={s.skill_key} className="flex items-center gap-2.5">
                <span className="text-base" aria-hidden>{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-gray-700">{display}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${meta.bar}`}
                      style={{ width: `${Math.max(4, s.mastery_pct)}%` }}
                    />
                  </div>
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] font-black text-gray-600">{s.mastery_pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-[#0F4D92]/5 via-white to-[#0d9488]/5 p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
            💡 {t('portfolio.recommendations.title', { defaultValue: 'What to play next' })}
          </h3>
          <div className="space-y-1.5">
            {recommendations.map((r, i) => {
              const icon = r.type === 'strength' ? '🌟' : r.type === 'support' ? '🤝' : r.type === 'focus' ? '🎯' : '🎉';
              const key = r.skill_key?.split('.').pop() || '';
              const note = r.type === 'support'
                ? t('portfolio.recommendations.support', { skill: key, defaultValue: `${key} needs support — review games help!` })
                : r.type === 'focus'
                  ? t('portfolio.recommendations.focus', { skill: key, defaultValue: `Keep practicing ${key} to master it!` })
                  : r.type === 'strength'
                    ? t('portfolio.recommendations.strength', { skill: key, defaultValue: `${key} is mastered — celebrate!` })
                    : t('portfolio.recommendations.celebrate', { defaultValue: 'Play a first game to start your skill map!' });
              return (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm">
                  <span className="text-base">{icon}</span>
                  <p className="text-xs font-bold text-gray-700">{note}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}