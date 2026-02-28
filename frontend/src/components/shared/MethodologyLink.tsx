import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

export default function MethodologyLink() {
  return (
    <Link
      to="/methodology#metrics"
      className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
    >
      <HelpCircle className="h-4 w-4" />
      Как считаются метрики?
    </Link>
  );
}
