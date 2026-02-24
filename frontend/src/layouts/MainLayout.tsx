import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar, { SIDEBAR_WIDTH } from '@/components/sidebar/Sidebar';
import { useUIStore } from '@/stores/ui.store';
import { useIsMobile } from '@/hooks/useMediaQuery';

export default function MainLayout() {
  const isMobile = useIsMobile();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />

      <div className="flex-1 flex flex-col" style={isMobile ? undefined : { marginLeft: SIDEBAR_WIDTH }}>
        {isMobile && (
          <header className="sticky top-0 z-30 flex h-14 items-center border-b border-gray-200 bg-white px-4 dark:border-surface-border dark:bg-surface">
            <button
              onClick={toggleSidebar}
              aria-label="Открыть меню"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-lighter dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Menu size={20} />
            </button>
            <span className="ml-3 text-lg font-semibold text-brand-400">DevPulse</span>
          </header>
        )}

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
