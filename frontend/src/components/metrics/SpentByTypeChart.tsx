import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import { getCategoryLabel, getCategoryColor } from '@/utils/task-categories';

interface SpentByTypeChartProps {
  data: Record<string, number>;
  height?: number;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: TooltipPayloadItem }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-gray-800 px-3 py-2 shadow-xl">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {payload[0].payload.value.toFixed(1)} ч
      </div>
    </div>
  );
}

export default function SpentByTypeChart({ data, height }: SpentByTypeChartProps) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: getCategoryLabel(key),
      value: Number(value.toFixed(1)),
      color: getCategoryColor(key),
    }))
    .sort((a, b) => b.value - a.value);

  if (!chartData.length) {
    return (
      <div
        className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500"
        style={{ minHeight: height ?? 120 }}
      >
        Нет данных
      </div>
    );
  }

  const minHeight = height ?? Math.max(100, chartData.length * 40 + 40);

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={minHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={{ stroke: '#2a2a3a' }}
          tickLine={false}
          unit="ч"
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <RechartsTooltip content={<CustomTooltip />} />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          barSize={20}
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
