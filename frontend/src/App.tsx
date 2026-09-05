import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from '@/pages/Login/Login';
import Dashboard from '@/pages/Dashboard/Dashboard';
import ParentChildren from '@/pages/Parent/ParentChildren';
import ParentActivities from '@/pages/Parent/ParentActivities';
import ParentDashboard from '@/components/ParentDashboard';
import StudentHome from '@/pages/Student/StudentHome';
import AuthGuard from '@/components/AuthGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import TrialBanner from '@/components/TrialBanner';
import { applyDir, loadLocale, t, useI18n } from '@/lib/i18n';
import { applyLowEndMode } from '@/lib/utils/lowEnd';

/**
 * App shell — routes for the EliteKids SPA.
 *
 * Perf (#11): heavy pages (GamePlay is 4k+ lines, teacher tools bundle Phaser-adjacent
 * renderers and pickers) are lazy-loaded per-route so the initial chunk stays lean.
 * The shell (Login/Dashboard/StudentHome) stays eager for first-paint speed.
 */

// Lazy route pages — loaded on first navigation to their route.
const GamePlay = lazy(() => import('@/pages/Student/GamePlay'));
const SpeechPractice = lazy(() => import('@/pages/Student/SpeechPractice'));
const DrawingPractice = lazy(() => import('@/pages/Student/DrawingPractice'));
const TeacherLessons = lazy(() => import('@/pages/Teacher/TeacherLessons'));
const TeacherApprovals = lazy(() => import('@/pages/Teacher/TeacherApprovals'));
const TeacherArena = lazy(() => import('@/pages/Teacher/TeacherArena'));
const TeacherLive = lazy(() => import('@/pages/Teacher/TeacherLive'));
const TeacherAnalytics = lazy(() => import('@/pages/Teacher/TeacherAnalytics'));
const GlobalLibrary = lazy(() => import('@/pages/Teacher/GlobalLibrary'));
const NerdcReport = lazy(() => import('@/pages/Teacher/NerdcReport'));
const GameCreator = lazy(() => import('@/pages/Teacher/GameCreator'));
const TeacherVoiceNotes = lazy(() => import('@/pages/Teacher/TeacherVoiceNotes'));
const ParentLive = lazy(() => import('@/pages/Parent/ParentLive'));
const AssetLibrary = lazy(() => import('@/pages/Admin/AssetLibrary'));
const Marketplace = lazy(() => import('@/pages/Teacher/Marketplace'));
const PlatformAnalytics = lazy(() => import('@/pages/Admin/PlatformAnalytics'));

/** Minimal loading fallback so lazy chunks don't flash a blank screen. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="animate-pulse text-3xl" role="status" aria-label={t('app.loading')}>
        ⭐
      </div>
    </div>
  );
}

/** Wrap a lazy page in Suspense + ErrorBoundary with an optional guard. */
function LazyRoute({ element }: { element: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <ErrorBoundary>{element}</ErrorBoundary>
    </Suspense>
  );
}

/** Pre-submit draft preview: renders GamePlay from an in-memory config (no lesson saved yet). */
function DraftPreview() {
  const location = useLocation();
  const state = (location.state || {}) as { config?: unknown; scenes?: unknown[] };
  return <GamePlay initialConfig={{ config: state.config, scenes: state.scenes as any } as any} />;
}

export default function App() {
  const locale = useI18n((s) => s.locale);
  const dir = useI18n((s) => s.dir);

  // Tag <html> with data-low-end on mount so CSS can strip GPU-heavy effects on weak devices.
  useEffect(applyLowEndMode, []);

  useEffect(() => {
    if (locale !== 'en') void loadLocale(locale);
  }, [locale]);

  useEffect(() => {
    applyDir();
  }, [dir]);

  // The OfflineIndicator used to live here globally. It was removed because
  // it leaked a connection/sync badge onto every route (teacher, admin, and a
  // second copy on student). Student-facing routes opt into a `silent` indicator
  // instead; the sync service (lib/offline/sync) auto-drains regardless of UI.
  return (
    <>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <Dashboard />
          </AuthGuard>
        }
      />
      <Route
        path="/parent"
        element={
          <AuthGuard>
            <ParentChildren />
          </AuthGuard>
        }
      />
      <Route
        path="/parent/activities"
        element={
          <AuthGuard>
            <ParentActivities />
          </AuthGuard>
        }
      />
      <Route
        path="/parent/dashboard"
        element={
          <AuthGuard>
            <ParentDashboard />
          </AuthGuard>
        }
      />
      <Route
        path="/parent/live"
        element={
          <AuthGuard>
            <LazyRoute element={<ParentLive />} />
          </AuthGuard>
        }
      />
      <Route
        path="/student"
        element={
          <AuthGuard>
            <ErrorBoundary>
              <StudentHome />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/student/game/:lessonId"
        element={
          <AuthGuard>
            <LazyRoute element={<GamePlay />} />
          </AuthGuard>
        }
      />
      <Route
        path="/student/speech"
        element={
          <AuthGuard>
            <LazyRoute element={<SpeechPractice />} />
          </AuthGuard>
        }
      />
      <Route
        path="/student/drawing"
        element={
          <AuthGuard>
            <LazyRoute element={<DrawingPractice />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/preview/:lessonId"
        element={
          <AuthGuard>
            <LazyRoute element={<GamePlay />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/preview-draft"
        element={
          <AuthGuard>
            <LazyRoute element={<DraftPreview />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/lessons"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherLessons />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/nerdc-report"
        element={
          <AuthGuard>
            <LazyRoute element={<NerdcReport />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/approvals"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherApprovals />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/arena"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherArena />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/live"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherLive />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/voice-notes"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherVoiceNotes />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/analytics"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherAnalytics />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/marketplace"
        element={
          <AuthGuard>
            <LazyRoute element={<Marketplace />} />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/platform-analytics"
        element={
          <AuthGuard>
            <LazyRoute element={<PlatformAnalytics />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/global-library"
        element={
          <AuthGuard>
            <LazyRoute element={<GlobalLibrary />} />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/create-game"
        element={
          <AuthGuard>
            <LazyRoute element={<GameCreator />} />
          </AuthGuard>
        }
      />
      <Route
        path="/admin/assets"
        element={
          <AuthGuard>
            <LazyRoute element={<AssetLibrary />} />
          </AuthGuard>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    {/* Trial countdown + subscribe CTA — self-hiding (non-trial schools see nothing) */}
    <TrialBanner />
    </>
  );
}
