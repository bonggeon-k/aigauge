import { RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

interface UsageGaugeProps {
  used: number;
  limit: number;
  label: string;
}

export const UsageGauge = ({ used, limit, label }: UsageGaugeProps) => {
  const percentage = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="95%"
          barSize={16}
          data={[{ name: label, value: percentage }]}
          startAngle={210}
          endAngle={-30}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={12}
            fill="var(--color-primary)"
            background={{ fill: "color-mix(in srgb, var(--color-border) 70%, transparent)" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <p className="-mt-3 text-center text-sm text-muted-foreground">{percentage}% of quota</p>
    </div>
  );
};
