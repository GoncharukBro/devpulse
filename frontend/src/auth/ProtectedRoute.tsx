import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/auth/auth.store';
import { config } from '@/config';
import Spinner from '@/components/ui/Spinner';

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (!config.authEnabled) {
    return <Outlet />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ returnUrl: location.pathname + location.search }}
        replace
      />
    );
  }

  return <Outlet />;
}
