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

interface ChartDataItem {
  periodStart: string;
  [key: string]: string | number | null | undefined;
}

interface WeeklyChartProps {
  data: ChartDataItem[];
  metrics: MetricDef[];
  height?: number;
}

function buildWeekLabels(data: ChartDataItem[]): string[] {
  let prevYear: number | null = null;
  return data.map((item, i) => {
    const d = new Date(item.periodStart);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const shortYear = String(year).slice(2);
    const showYear = i === 0 || year !== prevYear;
    prevYear = year;
    return showYear ? `${day}.${month}.${shortYear}` : `${day}.${month}`;
  });
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

function formatTooltipDate(periodStart: string): string {
  const d = new Date(periodStart);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const endDay = end.getDate().toString().padStart(2, '0');
  const endMonth = (end.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month} — ${endDay}.${endMonth}.${end.getFullYear()}`;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const original = (payload[0] as unknown as { payload: ChartDataItem }).payload;
  const tooltipLabel = original?.periodStart ? formatTooltipDate(original.periodStart) : '';

  return (
    <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-gray-800 px-3 py-2 shadow-xl">
      <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">{tooltipLabel}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {entry.value !== null && entry.value !== undefined ? entry.value.toFixed(1) : 'Н/Д'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WeeklyChart({ data, metrics, height = 280 }: WeeklyChartProps) {
  const labels = buildWeekLabels(data);
  const chartData = data.map((d, i) => ({
    ...d,
    label: labels[i],
  }));

  if (!chartData.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500"
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
        <CartesianGrid className="stroke-gray-200 dark:stroke-surface-border" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
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
