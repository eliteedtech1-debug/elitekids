import RevisionCard from '@/components/RevisionCard';
import ReviewZone from '@/components/ReviewZone';
import { t } from '@/lib/i18n';

/**
 * REVIEW tab — the single home of daily/weekly revision and spaced
 * repetition. The ReviewDueBadge, the quick-nav "Review Zone" action and any
 * `#review-zone` scroll target all land here, so revision never competes with
 * the games grid for attention (see STUDENT-TAB-RESTRUCTURE.md).
 */
export default function ReviewTab() {
  return (
    <div className="animate-game-slide-up">
      <h2 className="mb-3 text-lg font-bold text-gray-800">{t('student.tab.review')}</h2>

      {/* Daily & weekly revision */}
      <div className="mb-5">
        <RevisionCard />
      </div>

      {/* Review Zone (spaced repetition) — ReviewDueBadge scrolls here */}
      <div id="review-zone" className="mb-5 scroll-mt-4">
        <ReviewZone />
      </div>
    </div>
  );
}
