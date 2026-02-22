import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { settingsApi, type LlmSettings as LlmSettingsType } from '@/api/endpoints/settings';

export default function LlmSettings() {
  const [settings, setSettings] = useState<LlmSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.3');
  const [rateLimit, setRateLimit] = useState('3');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await settingsApi.getLlm();
      setSettings(result);
      setModel(result.model);
      setTemperature(String(result.temperature));
      setRateLimit(String(result.rateLimit));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tempNum = parseFloat(temperature);
  const rateNum = parseInt(rateLimit, 10);
  const tempValid = !isNaN(tempNum) && tempNum >= 0 && tempNum <= 1;
  const rateValid = !isNaN(rateNum) && rateNum >= 1 && rateNum <= 60;
  const isValid = model.trim().length > 0 && tempValid && rateValid;

  const hasChanges = settings
    ? model !== settings.model ||
      tempNum !== settings.temperature ||
      rateNum !== settings.rateLimit
    : false;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const result = await settingsApi.updateLlm({
        model: model.trim(),
        temperature: tempNum,
        rateLimit: rateNum,
      });
      setSettings(result);
      toast.success('Настройки сохранены');
    } catch {
      // Error toast shown by interceptor
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-200 dark:border-surface-border bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-brand-500';
  const inputErrorClass =
    'w-full rounded-lg border border-red-500/50 bg-gray-100 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-red-500';

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">LLM (Ollama)</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <div className="py-4 text-center">
          <p className="mb-2 text-sm text-gray-400 dark:text-gray-500">Не удалось загрузить настройки LLM</p>
          <p className="text-xs text-gray-500 dark:text-gray-600">Возможно, сервис LLM не настроен</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">Модель</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemma3:4b"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
              Температура <span className="text-xs text-gray-400 dark:text-gray-500">(0.0 — 1.0)</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className={tempValid || temperature === '' ? inputClass : inputErrorClass}
            />
            {!tempValid && temperature !== '' && (
              <p className="mt-1 text-xs text-red-400">Значение должно быть от 0 до 1</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
              Rate Limit <span className="text-xs text-gray-400 dark:text-gray-500">(запросов/мин, 1—60)</span>
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="60"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              className={rateValid || rateLimit === '' ? inputClass : inputErrorClass}
            />
            {!rateValid && rateLimit !== '' && (
              <p className="mt-1 text-xs text-red-400">Значение должно быть от 1 до 60</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs">
              {settings && (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-gray-500 dark:text-gray-400">Подключено</span>
                  {settings.baseUrl && (
                    <span className="text-gray-500 dark:text-gray-600">({settings.baseUrl})</span>
                  )}
                </>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!isValid || !hasChanges}
              onClick={handleSave}
            >
              Сохранить
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
