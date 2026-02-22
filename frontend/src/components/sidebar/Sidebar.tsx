import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  FolderKanban,
  Users,
  Trophy,
  Database,
  Settings,
  LogOut,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useThemeStore } from '@/stores/theme.store';
import { useAuthStore } from '@/auth/auth.store';
import * as authService from '@/auth/auth.service';
import { useIsMobile } from '@/hooks/useMediaQuery';

const analyticsNav = [
  { label: 'Обзор', to: '/overview', icon: BarChart3 },
  { label: 'Проекты', to: '/projects', icon: FolderKanban },
  { label: 'Команды', to: '/teams', icon: Users },
  { label: 'Ачивки', to: '/achievements', icon: Trophy },
];

const managementNav = [
  { label: 'Сбор данных', to: '/collection', icon: Database },
  { label: 'Настройки', to: '/settings', icon: Settings },
];

export default function Sidebar() {
  const isMobile = useIsMobile();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const handleLogout = () => {
    clearAuth();
    authService.logout();
  };

  const closeSidebar = () => setSidebarOpen(false);

  if (isMobile && !sidebarOpen) return null;

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col border-r border-gray-200 bg-white shadow-sm dark:border-surface-border dark:bg-surface dark:shadow-none ${
          isMobile ? 'animate-[slideIn_200ms_ease-out]' : ''
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
              <Activity size={18} className="text-brand-400" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">DevPulse</span>
          </div>
          {isMobile && (
            <button
              onClick={closeSidebar}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-lighter dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <NavSection title="Аналитика" items={analyticsNav} onNavigate={isMobile ? closeSidebar : undefined} />
          <NavSection title="Управление" items={managementNav} onNavigate={isMobile ? closeSidebar : undefined} />
        </nav>

        {/* Theme toggle + User */}
        <div className="border-t border-gray-200 dark:border-surface-border p-4">
          <button
            onClick={toggleTheme}
            className="mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-surface-lighter dark:hover:text-gray-200"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-300">
              {(user?.fullName?.[0] ?? user?.username?.[0] ?? 'D').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                {user?.fullName ?? user?.username ?? 'Director'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-surface-lighter dark:hover:text-gray-300"
              title="Выйти"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

interface NavSectionProps {
  title: string;
  items: { label: string; to: string; icon: React.ElementType }[];
  onNavigate?: () => void;
}

function NavSection({ title, items, onNavigate }: NavSectionProps) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-surface-lighter dark:hover:text-gray-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500" />
                  )}
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
