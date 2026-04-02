const STACK = [
  { label: 'Frontend', value: 'React 18 · TypeScript · Vite · Tailwind' },
  { label: 'Backend', value: 'Node.js · Fastify · MikroORM' },
  { label: 'База', value: 'PostgreSQL' },
  { label: 'ИИ', value: 'LLM (OpenAI-совместимый)' },
  { label: 'Авториз.', value: 'Keycloak' },
];

export default function AboutSection() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">DevPulse</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Система сбора и анализа метрик разработчиков
          </p>
        </div>
        <span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500">
          v0.1.0
        </span>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Стек</p>
        <div className="rounded-lg border border-gray-200 dark:border-surface-border overflow-hidden">
          {STACK.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-4 px-4 py-2.5 text-xs ${
                i < STACK.length - 1 ? 'border-b border-gray-200 dark:border-surface-border' : ''
              }`}
            >
              <span className="w-20 shrink-0 font-medium text-gray-500 dark:text-gray-400">
                {item.label}
              </span>
              <span className="text-gray-700 dark:text-gray-200">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        &copy; 2025&ndash;2026 DevPulse
      </p>
    </div>
  );
}
