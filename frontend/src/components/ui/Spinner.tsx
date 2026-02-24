type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeMap: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 40,
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export default function Spinner({ size = 'md', className = '', label = 'Загрузка' }: SpinnerProps) {
  const px = sizeMap[size];
  return (
    <svg
      className={`animate-spin text-brand-500 ${className}`}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
