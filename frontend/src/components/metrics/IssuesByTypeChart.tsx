import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { getCategoryLabel, getCategoryColor } from '@/utils/task-categories';

interface IssuesByTypeChartProps {
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
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-surface-border bg-white dark:bg-gray-800 px-3 py-2 shadow-xl">
      <span className="text-sm text-gray-900 dark:text-gray-100">
        {item.name}: <span className="font-medium">{item.value}</span>
      </span>
    </div>
  );
}

export default function IssuesByTypeChart({ data, height = 240 }: IssuesByTypeChartProps) {
  const chartData = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: getCategoryLabel(key),
      value,
      color: getCategoryColor(key),
    }));

  if (!chartData.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-surface-border text-sm text-gray-400 dark:text-gray-500"
        style={{ height }}
      >
        Нет данных
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={chartData[index].color} />
          ))}
        </Pie>
        <RechartsTooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => (
            <span className="text-xs text-gray-500 dark:text-gray-400">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
