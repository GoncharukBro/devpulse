import { useEffect, useState, useCallback } from 'react';
import { Eye, Copy, Send, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { aggregatedReportsApi } from '@/api/endpoints/aggregated-reports';

interface AggregatedEmailModalProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
}

interface EmailCache {
  subject: string;
  html: string;
}

export default function AggregatedEmailModal({
  open,
  onClose,
  reportId,
}: AggregatedEmailModalProps) {
  const [cache, setCache] = useState<EmailCache | null>(null);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);

  const fetchData = useCallback(async (): Promise<EmailCache> => {
    if (cache) return cache;
    const data = await aggregatedReportsApi.emailPreview(reportId);
    setCache(data);
    return data;
  }, [cache, reportId]);

  useEffect(() => {
    if (!open) {
      setCache(null);
      return;
    }

    let cancelled = false;
    setLoadingSubject(true);
    aggregatedReportsApi
      .emailPreview(reportId)
      .then((data) => {
        if (!cancelled) setCache(data);
      })
      .catch(() => {
        if (!cancelled) toast.error('Не удалось загрузить данные для письма');
      })
      .finally(() => {
        if (!cancelled) setLoadingSubject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, reportId]);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await fetchData();
      const blob = new Blob([data.html], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('Не удалось загрузить предпросмотр');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopy = async () => {
    setCopyLoading(true);
    try {
      const data = await fetchData();
      await navigator.clipboard.writeText(data.html);
      toast.success('HTML скопирован в буфер обмена');
    } catch {
      toast.error('Не удалось скопировать');
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📧 Отчёт по email"
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            onClick={handlePreview}
            disabled={previewLoading || loadingSubject}
          >
            Предпросмотр
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={copyLoading ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            onClick={handleCopy}
            disabled={copyLoading || loadingSubject}
          >
            Копировать
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Send size={14} />}
            disabled
            title="SMTP не настроен"
          >
            Отправить
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">
            Тема письма:
          </label>
          {loadingSubject ? (
            <div className="flex h-[38px] items-center rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-lighter px-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700/50" />
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-gray-50 dark:bg-surface-lighter px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
              {cache?.subject ?? '—'}
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="text-sm text-gray-600 dark:text-gray-300">
            <p className="font-medium text-amber-400">SMTP-сервер не настроен</p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Вы можете предпросмотреть и скопировать письмо для отправки вручную.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
