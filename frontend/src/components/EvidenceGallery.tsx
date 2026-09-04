import { t } from '@/lib/i18n';

/**
 * EvidenceGallery (Q2-E portfolio FE leaf, Q29).
 *
 * Shows the portfolio's evidence section (from GET /kids/portfolio/:childId):
 * speaking attempts rollup + recent items, and game sessions rollup + recent
 * items, plus the 7-day weekly strip. Child + parent safe copy.
 */

export interface SpeakingEvidence {
  attempts: number;
  passed: number;
  pass_rate_pct: number;
  avg_score_pct: number;
  recent: Array<{
    expected_text: string;
    transcript?: string | null;
    mode?: string;
    overall_score: number;
    passed: boolean;
    created_at?: string | null;
  }>;
}

export interface GamesEvidence {
  sessions: number;
  total_stars: number;
  total_xp: number;
  avg_score_pct: number;
  recent: Array<{
    lesson_id: string;
    mode?: string;
    score: number;
    stars_earned: number;
    xp: number;
    completed_at?: string | null;
  }>;
}

export interface WeeklyStats {
  sessions_7d: number;
  xp_7d: number;
}

interface EvidenceGalleryProps {
  speaking?: SpeakingEvidence;
  games?: GamesEvidence;
  weekly?: WeeklyStats;
}

function fmtDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(String(d).includes('T') ? d : `${d.replace(' ', 'T')}Z`);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function EvidenceGallery({ speaking, games, weekly }: EvidenceGalleryProps) {
  const sp = speaking || { attempts: 0, passed: 0, pass_rate_pct: 0, avg_score_pct: 0, recent: [] };
  const gm = games || { sessions: 0, total_stars: 0, total_xp: 0, avg_score_pct: 0, recent: [] };
  const wk = weekly || { sessions_7d: 0, xp_7d: 0 };

  const hasAnything = sp.attempts > 0 || gm.sessions > 0;

  if (!hasAnything) {
    return (
      <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-2xl">📚</p>
        <p className="mt-1 text-sm font-bold text-gray-600">
          {t('portfolio.evidence.empty', { defaultValue: 'No evidence yet — play games and practice speaking to fill your gallery!' })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weekly strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-black text-teal-600">{wk.sessions_7d}</p>
          <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.sessions7d', { defaultValue: 'Games this week' })}</p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-black text-amber-500">{wk.xp_7d}</p>
          <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.xp7d', { defaultValue: 'XP this week' })}</p>
        </div>
      </div>

      {/* Speaking */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
          🎤 {t('portfolio.evidence.speaking', { defaultValue: 'Speaking Practice' })}
        </h3>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-black text-gray-800">{sp.attempts}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.attempts', { defaultValue: 'Attempts' })}</p>
          </div>
          <div>
            <p className="text-base font-black text-emerald-600">{sp.pass_rate_pct}%</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.passRate', { defaultValue: 'Pass rate' })}</p>
          </div>
          <div>
            <p className="text-base font-black text-teal-600">{sp.avg_score_pct}%</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.avgScore', { defaultValue: 'Avg score' })}</p>
          </div>
        </div>
        {sp.recent.length > 0 && (
          <div className="space-y-1.5">
            {sp.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-gray-700">{r.expected_text}</p>
                  <p className="text-[10px] text-gray-400">
                    {r.mode} · {fmtDate(r.created_at)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${r.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {r.overall_score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Games */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
          🎮 {t('portfolio.evidence.games', { defaultValue: 'Games Played' })}
        </h3>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-black text-gray-800">{gm.sessions}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.sessions', { defaultValue: 'Sessions' })}</p>
          </div>
          <div>
            <p className="text-base font-black text-amber-500">{gm.total_stars} ⭐</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.stars', { defaultValue: 'Stars' })}</p>
          </div>
          <div>
            <p className="text-base font-black text-purple-600">{gm.total_xp}</p>
            <p className="text-[10px] font-semibold text-gray-500">{t('portfolio.evidence.xp', { defaultValue: 'XP' })}</p>
          </div>
        </div>
        {gm.recent.length > 0 && (
          <div className="space-y-1.5">
            {gm.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-gray-700">{r.lesson_id}</p>
                  <p className="text-[10px] text-gray-400">
                    {r.mode} · {fmtDate(r.completed_at)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-gray-600">{r.score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}