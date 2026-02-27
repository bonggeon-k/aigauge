import { useMemo, useState } from "react";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostSummary, MonthlyCostHistory, PaceAnalysis } from "@/hooks/useCostAnalytics";
import { Card } from "@/components/ui/card";
import { PaceIndicator } from "@/components/analytics/PaceIndicator";

interface CostDashboardProps {
  summary: CostSummary | null;
  history: MonthlyCostHistory[];
  pace: PaceAnalysis | null;
}

const ranges = ["this_month", "last_3", "last_6", "last_year", "custom"] as const;
type RangeValue = (typeof ranges)[number];

export const CostDashboard = ({ summary, history, pace }: CostDashboardProps) => {
  const [range, setRange] = useState<RangeValue>("last_6");

  const historyView = useMemo(() => {
    if (range === "this_month") {
      return history.slice(-1);
    }
    if (range === "last_3") {
      return history.slice(-3);
    }
    if (range === "last_6") {
      return history.slice(-6);
    }
    if (range === "last_year") {
      return history.slice(-12);
    }
    return history;
  }, [history, range]);

  const current = summary?.total_monthly ?? 0;
  const previous = history.length > 1 ? history[history.length - 2]?.total ?? 0 : 0;
  const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  return (
    <section className="grid gap-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Cost Analytics</h2>
          <div className="flex flex-wrap gap-2">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs ${
                  range === item ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
                onClick={() => setRange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-56">
            <p className="sr-only">Monthly cost trend chart showing total spend by month.</p>
            <ResponsiveContainer>
              <LineChart data={historyView}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  formatter={(value: number | string | undefined) =>
                    `$${Number(value ?? 0).toFixed(2)}`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="h-56">
            <p className="sr-only">Provider cost share donut chart.</p>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={summary?.by_provider ?? []}
                  dataKey="amount"
                  nameKey="provider"
                  innerRadius={45}
                  outerRadius={75}
                >
                  {(summary?.by_provider ?? []).map((entry, index) => (
                    <Cell key={entry.provider} fill={`var(--chart-${(index % 7) + 1})`} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | string | undefined) =>
                    `$${Number(value ?? 0).toFixed(2)}`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Current month</p>
          <p className="text-xl font-semibold">${current.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Previous month</p>
          <p className="text-xl font-semibold">${previous.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">MoM</p>
          <p className={`text-xl font-semibold ${changePct > 0 ? "text-destructive" : "text-emerald-600"}`}>
            {changePct.toFixed(1)}%
          </p>
        </Card>
      </div>

      <PaceIndicator pace={pace} />
    </section>
  );
};
