import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login/Login';
import Dashboard from '@/pages/Dashboard/Dashboard';
import ParentChildren from '@/pages/Parent/ParentChildren';
import ParentActivities from '@/pages/Parent/ParentActivities';
import ParentDashboard from '@/components/ParentDashboard';
import StudentHome from '@/pages/Student/StudentHome';
import AuthGuard from '@/components/AuthGuard';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineIndicator from '@/components/OfflineIndicator';
import { applyDir, useI18n } from '@/lib/i18n';

/**
 * App shell — routes for the EliteKids SPA.
 *
 * Perf (#11): heavy pages (GamePlay is 4k+ lines, teacher tools bundle Phaser-adjacent
 * renderers and pickers) are lazy-loaded per-route so the initial chunk stays lean.
 * The shell (Login/Dashboard/StudentHome) stays eager for first-paint speed.
 */

// Lazy route pages — loaded on first navigation to their route.
const GamePlay = lazy(() => import('@/pages/Student/GamePlay'));
const TeacherLessons = lazy(() => import('@/pages/Teacher/TeacherLessons'));
const TeacherApprovals = lazy(() => import('@/pages/Teacher/TeacherApprovals'));
const TeacherArena = lazy(() => import('@/pages/Teacher/TeacherArena'));
const TeacherLive = lazy(() => import('@/pages/Teacher/TeacherLive'));
const TeacherAnalytics = lazy(() => import('@/pages/Teacher/TeacherAnalytics'));
const NerdcReport = lazy(() => import('@/pages/Teacher/NerdcReport'));
const GameCreator = lazy(() => import('@/pages/Teacher/GameCreator'));
const AssetLibrary = lazy(() => import('@/pages/Admin/AssetLibrary'));

/** Minimal loading fallback so lazy chunks don't flash a blank screen. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="animate-pulse text-3xl" role="status" aria-label="Loading">
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

export default function App() {
  const dir = useI18n((s) => s.dir);

  useEffect(() => {
    applyDir();
  }, [dir]);

  return (
    <>
    <OfflineIndicator />
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
        path="/teacher/analytics"
        element={
          <AuthGuard>
            <LazyRoute element={<TeacherAnalytics />} />
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
    </>
  );
}
