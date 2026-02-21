import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface EmailReportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function EmailReportModal({ open, onClose }: EmailReportModalProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Отправить отчёт на почту"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
          >
            Настроить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-gray-300">Email получателя</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@company.com"
            disabled
            className="w-full rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-sm text-gray-300 placeholder-gray-600 opacity-50"
          />
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="text-sm text-gray-300">
            <p className="font-medium text-amber-400">Отправка email пока недоступна</p>
            <p className="mt-1 text-gray-400">
              SMTP-сервер не настроен. Настройте SMTP в разделе Настройки.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
