import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface MetricDef {
  key: string;
  label: string;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartDataItem = Record<string, any>;

interface WeeklyChartProps {
  data: ChartDataItem[];
  metrics: MetricDef[];
  height?: number;
}

function formatWeek(periodStart: string): string {
  const d = new Date(periodStart);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-surface-border bg-gray-800 px-3 py-2 shadow-xl">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-300">{entry.name}:</span>
          <span className="font-medium text-gray-100">
            {entry.value !== null && entry.value !== undefined ? entry.value.toFixed(1) : 'Н/Д'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WeeklyChart({ data, metrics, height = 280 }: WeeklyChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatWeek(d.periodStart as string),
  }));

  if (!chartData.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-surface-border text-sm text-gray-500"
        style={{ height }}
      >
        Нет данных для графика
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
        <defs>
          {metrics.map((m) => (
            <linearGradient key={m.key} id={`gradient-${m.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={m.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={m.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={{ stroke: '#2a2a3a' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 'auto']}
        />
        <RechartsTooltip content={<CustomTooltip />} />
        {metrics.map((m) => (
          <Area
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.label}
            stroke={m.color}
            strokeWidth={2}
            fill={`url(#gradient-${m.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
