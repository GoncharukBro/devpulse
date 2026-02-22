import Card from '@/components/ui/Card';

export default function EmailSettings() {
  const inputClass =
    'w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-400 dark:text-gray-500 outline-none cursor-not-allowed';

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">📧</span>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Email (SMTP)</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-400 dark:text-gray-500">SMTP хост</label>
          <input
            type="text"
            value=""
            disabled
            placeholder="smtp.example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-400 dark:text-gray-500">Порт</label>
          <input
            type="number"
            value=""
            disabled
            placeholder="587"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-400 dark:text-gray-500">Email отправителя</label>
          <input
            type="email"
            value=""
            disabled
            placeholder="devpulse@example.com"
            className={inputClass}
          />
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100/50 dark:bg-surface-lighter/50 px-4 py-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Функция в разработке. Будет доступна в следующей версии.
          </p>
        </div>
      </div>
    </Card>
  );
}
