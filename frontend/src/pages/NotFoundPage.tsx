import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import { Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <h1 className="text-8xl font-extrabold text-brand-500/50">404</h1>
      <p className="mt-4 text-xl font-medium text-gray-600 dark:text-gray-300">Страница не найдена</p>
      <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
        Запрошенная страница не существует или была перемещена
      </p>
      <Link to="/overview" className="mt-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg">
        <Button variant="primary" leftIcon={<Home size={18} />}>
          Вернуться на главную
        </Button>
      </Link>
    </div>
  );
}
