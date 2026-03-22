import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import ProtectedRoute from '@/auth/ProtectedRoute';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAuthStore } from '@/auth/auth.store';
import LoginPage from '@/pages/LoginPage';
import OverviewPage from '@/pages/OverviewPage';
import ProjectsListPage from '@/pages/ProjectsListPage';
import ProjectPage from '@/pages/ProjectPage';
import EmployeesListPage from '@/pages/EmployeesListPage';
import EmployeePage from '@/pages/EmployeePage';
import TeamsListPage from '@/pages/TeamsListPage';
import TeamPage from '@/pages/TeamPage';
import AchievementsPage from '@/pages/AchievementsPage';
import ReportsPage from '@/pages/ReportsPage';
import AggregatedReportPage from '@/pages/AggregatedReportPage';
import CollectionPage from '@/pages/CollectionPage';
import SettingsPage from '@/pages/SettingsPage';
import MethodologyPage from '@/pages/MethodologyPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />

        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/employees" element={<EmployeesListPage />} />
            <Route path="/employees/:login" element={<EmployeePage />} />
            <Route path="/teams" element={<TeamsListPage />} />
            <Route path="/teams/:id" element={<TeamPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:id" element={<AggregatedReportPage />} />
            <Route path="/collection" element={<CollectionPage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/system" element={<SettingsPage />} />
            <Route path="/settings" element={<Navigate to="/system" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
