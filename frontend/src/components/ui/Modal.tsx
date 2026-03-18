import { type ReactNode, useEffect, useCallback, useRef, useId } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  autoFocus?: boolean;
}

export default function Modal({ open, onClose, title, children, footer, autoFocus = true }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      // Focus first focusable element or the dialog itself
      requestAnimationFrame(() => {
        if (dialogRef.current) {
          if (autoFocus) {
            const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (firstFocusable) {
              firstFocusable.focus();
            } else {
              dialogRef.current.focus();
            }
          } else {
            dialogRef.current.focus();
          }
        }
      });
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Restore focus on close
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" aria-hidden="true" />
      <div className="flex min-h-full items-start justify-center px-4 py-8">
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="relative z-10 flex w-full max-w-lg max-h-[calc(100vh-4rem)] flex-col animate-[fadeIn_150ms_ease-out] rounded-xl border border-gray-200 dark:border-surface-border bg-white dark:bg-surface shadow-2xl outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="shrink-0 border-b border-gray-200 dark:border-surface-border px-6 py-4">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
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
