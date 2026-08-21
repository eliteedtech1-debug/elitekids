import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '@/pages/Login/Login';
import Dashboard from '@/pages/Dashboard/Dashboard';
import ParentChildren from '@/pages/Parent/ParentChildren';
import ParentActivities from '@/pages/Parent/ParentActivities';
import StudentHome from '@/pages/Student/StudentHome';
import GamePlay from '@/pages/Student/GamePlay';
import TeacherLessons from '@/pages/Teacher/TeacherLessons';
import TeacherApprovals from '@/pages/Teacher/TeacherApprovals';
import AuthGuard from '@/components/AuthGuard';

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
            <StudentHome />
          </AuthGuard>
        }
      />
      <Route
        path="/student/game/:lessonId"
        element={
          <AuthGuard>
            <GamePlay />
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
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
