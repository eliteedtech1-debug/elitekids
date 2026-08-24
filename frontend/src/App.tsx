import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login/Login';
import Dashboard from '@/pages/Dashboard/Dashboard';
import ParentChildren from '@/pages/Parent/ParentChildren';
import ParentActivities from '@/pages/Parent/ParentActivities';
import StudentHome from '@/pages/Student/StudentHome';
import GamePlay from '@/pages/Student/GamePlay';
import TeacherLessons from '@/pages/Teacher/TeacherLessons';
import TeacherApprovals from '@/pages/Teacher/TeacherApprovals';
import TeacherArena from './pages/Teacher/TeacherArena';
import TeacherLive from './pages/Teacher/TeacherLive';
import GameCreator from '@/pages/Teacher/GameCreator';
import AssetLibrary from '@/pages/Admin/AssetLibrary';
import AuthGuard from '@/components/AuthGuard';
import ErrorBoundary from '@/components/ErrorBoundary';

/**
 * App shell — routes for the EliteKids SPA.
 * Sprints 2–3 will add /play and /teacher/* behind the same guard.
 */
export default function App() {
  return (
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
            <ErrorBoundary>
              <GamePlay />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/lessons"
        element={
          <AuthGuard>
            <TeacherLessons />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/approvals"
        element={
          <AuthGuard>
            <TeacherApprovals />
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/arena"
        element={
          <AuthGuard>
            <ErrorBoundary>
              <TeacherArena />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/live"
        element={
          <AuthGuard>
            <ErrorBoundary>
              <TeacherLive />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/teacher/create-game"
        element={
          <AuthGuard>
            <ErrorBoundary>
              <GameCreator />
            </ErrorBoundary>
          </AuthGuard>
        }
      />
      <Route
        path="/admin/assets"
        element={
          <AuthGuard>
            <AssetLibrary />
          </AuthGuard>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
