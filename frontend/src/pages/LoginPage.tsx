import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Activity, LogIn, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import * as authService from '@/auth/auth.service';
import { useAuthStore } from '@/auth/auth.store';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, setTokens } = useAuthStore();

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const returnUrl = (location.state as { returnUrl?: string })?.returnUrl;

  const [isProcessing, setIsProcessing] = useState(!!code);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated — redirect away
  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnUrl || '/overview', { replace: true });
    }
  }, [isAuthenticated, navigate, returnUrl]);

  // Handle Keycloak callback (guarded against StrictMode double-mount)
  const callbackHandled = useRef(false);
  useEffect(() => {
    if (!code || !state) return;
    if (callbackHandled.current) return;
    callbackHandled.current = true;

    (async () => {
      try {
        const tokens = await authService.handleCallback(code, state);
        setTokens(tokens);
        const savedUrl = authService.getSavedReturnUrl();
        navigate(savedUrl, { replace: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка авторизации';
        setError(message.length > 200 ? 'Ошибка авторизации. Попробуйте снова.' : message);
        setIsProcessing(false);
      }
    })();
  }, [code, state, setTokens, navigate]);

  const handleLogin = () => {
    authService.login(returnUrl || '/overview');
  };

  const handleRetry = () => {
    setError(null);
    authService.login(returnUrl || '/overview');
  };

  // Callback processing — show spinner
  if (isProcessing) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gray-950">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-brand-400/10 blur-[120px]" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400">Авторизация...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gray-950">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-brand-400/10 blur-[120px]" />
        <div className="relative z-10 w-full max-w-sm px-4">
          <div className="rounded-2xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-8 shadow-2xl">
            <div className="mb-6 flex flex-col items-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ошибка авторизации</h2>
              <p className="mt-2 text-center text-sm text-gray-400 dark:text-gray-500">{error}</p>
            </div>
            <Button variant="primary" size="lg" className="w-full" onClick={handleRetry}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default — login button
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gray-950">
      <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-brand-600/20 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-brand-400/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="rounded-2xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface p-8 shadow-2xl">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 shadow-lg shadow-brand-500/10">
              <Activity size={28} className="text-brand-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">DevPulse</h1>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Аналитика разработки</p>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            leftIcon={<LogIn size={18} />}
            onClick={handleLogin}
          >
            Войти через Keycloak
          </Button>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-600">
            Авторизация через корпоративный SSO
          </p>
        </div>
      </div>
    </div>
  );
}
