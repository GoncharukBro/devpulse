import { useEffect } from 'react';

/** Устанавливает document.title = "DevPulse — {subtitle}" */
export function usePageTitle(subtitle: string) {
  useEffect(() => {
    document.title = subtitle ? `DevPulse — ${subtitle}` : 'DevPulse';
    return () => {
      document.title = 'DevPulse';
    };
  }, [subtitle]);
}
