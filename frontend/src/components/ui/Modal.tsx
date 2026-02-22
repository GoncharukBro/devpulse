import { type ReactNode, useEffect, useCallback } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="flex min-h-full items-start justify-center px-4 py-8">
        <div
          className="relative z-10 flex w-full max-w-lg max-h-[calc(100vh-4rem)] flex-col animate-[fadeIn_150ms_ease-out] rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="shrink-0 border-b border-gray-200 dark:border-surface-border px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 dark:border-surface-border px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
