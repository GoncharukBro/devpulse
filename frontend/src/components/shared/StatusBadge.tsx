import Badge from '@/components/ui/Badge';

interface StatusBadgeProps {
  status: string;
  llmProcessedAt?: string | null;
}

export default function StatusBadge({ status, llmProcessedAt }: StatusBadgeProps) {
  if (status === 'completed' && llmProcessedAt) {
    return <Badge variant="success">LLM готов</Badge>;
  }

  if (status === 'completed') {
    return <Badge variant="info">Собрано</Badge>;
  }

  if (status === 'processing') {
    return <Badge variant="warning">Обработка</Badge>;
  }

  if (status === 'error') {
    return <Badge variant="danger">Ошибка</Badge>;
  }

  return <Badge variant="neutral">{status}</Badge>;
}
