import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import Button from '@/components/ui/Button';

interface CopyButtonProps {
  getText: () => string;
  label?: string;
  className?: string;
}

export default function CopyButton({ getText, label = 'Копировать', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = getText();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
      onClick={handleCopy}
      className={className}
    >
      {copied ? 'Скопировано' : label}
    </Button>
  );
}
