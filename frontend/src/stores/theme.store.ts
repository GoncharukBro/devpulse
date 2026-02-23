import { create } from 'zustand';

type Theme = 'dark' | 'light' | 'system';

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  } else {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: (localStorage.getItem('devpulse-theme') as Theme) || 'dark',

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(newTheme);
  },

  setTheme: (theme) => {
    localStorage.setItem('devpulse-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// Listen for OS theme changes when 'system' is selected
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (useThemeStore.getState().theme === 'system') {
    document.documentElement.classList.toggle('dark', e.matches);
  }
});
