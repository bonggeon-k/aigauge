import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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

const rangeLabel: Record<RangeValue, string> = {
  this_month: "This month",
  last_3: "Last 3m",
  last_6: "Last 6m",
  last_year: "Last 12m",
  custom: "All",
};

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
  const changeUp = changePct > 0;

  return (
    <section className="grid gap-4 anim-rise">
      <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-3)]" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Cost Analytics</h2>
          <div className="flex flex-wrap gap-2 rounded-full bg-[var(--surface-1)] p-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  range === item
                    ? "bg-[var(--nav-active)] text-[var(--nav-active-fg)] shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRange(item)}
              >
                {rangeLabel[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div
            className="h-56 rounded-xl bg-[var(--surface-1)] p-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
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
          </motion.div>

          <motion.div
            className="h-56 rounded-xl bg-[var(--surface-1)] p-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
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
          </motion.div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Current month</p>
          <p className="text-xl font-semibold tracking-tight">${current.toFixed(2)}</p>
        </Card>
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Previous month</p>
          <p className="text-xl font-semibold tracking-tight">${previous.toFixed(2)}</p>
        </Card>
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">MoM</p>
          <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xl font-semibold ${changeUp ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}`}>
            {changeUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {changePct.toFixed(1)}%
          </div>
        </Card>
      </div>

      <PaceIndicator pace={pace} />
    </section>
  );
};
