import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';

export default function ThemeSelector() {
  const { theme, setTheme } = useThemeStore();

  const baseClass =
    'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer';
  const activeClass =
    'bg-brand-500/10 text-brand-500 border-2 border-brand-500';
  const inactiveClass =
    'bg-gray-100 dark:bg-surface-lighter text-gray-500 dark:text-gray-400 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600';

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Тема оформления
      </h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Текущая тема: {theme === 'dark' ? 'Тёмная' : 'Светлая'}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => setTheme('dark')}
          className={`${baseClass} ${theme === 'dark' ? activeClass : inactiveClass}`}
        >
          <Moon size={16} />
          Тёмная
        </button>
        <button
          onClick={() => setTheme('light')}
          className={`${baseClass} ${theme === 'light' ? activeClass : inactiveClass}`}
        >
          <Sun size={16} />
          Светлая
        </button>
      </div>
    </div>
  );
}
