interface PeriodFilterProps {
  value: number;
  onChange: (weeks: number) => void;
}

const OPTIONS = [
  { label: '4 нед.', value: 4 },
  { label: '8 нед.', value: 8 },
  { label: '12 нед.', value: 12 },
  { label: '24 нед.', value: 24 },
];

export default function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="inline-flex rounded-lg border border-surface-border bg-surface">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-brand-500/20 text-brand-400'
              : 'text-gray-400 hover:text-gray-200'
          } ${opt.value === OPTIONS[0].value ? 'rounded-l-lg' : ''} ${
            opt.value === OPTIONS[OPTIONS.length - 1].value ? 'rounded-r-lg' : ''
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
