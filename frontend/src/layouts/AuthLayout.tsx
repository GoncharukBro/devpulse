import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Outlet />
    </main>
  );
}
