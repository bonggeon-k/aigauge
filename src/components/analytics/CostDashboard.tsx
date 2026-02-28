import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CostSummary,
  MonthlyCostHistory,
  PaceAnalysis,
} from "@/hooks/useCostAnalytics";
import { Card } from "@/components/ui/card";
import { PaceIndicator } from "@/components/analytics/PaceIndicator";

interface CostDashboardProps {
  summary: CostSummary | null;
  history: MonthlyCostHistory[];
  pace: PaceAnalysis | null;
}

const ranges = ["this_month", "last_3", "last_6", "last_year", "custom"] as const;
type RangeValue = (typeof ranges)[number];

const colorAt = (index: number): string => `var(--chart-${(index % 7) + 1})`;

const formatCurrency = (value: number, currency = "USD"): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

export const CostDashboard = ({ summary, history, pace }: CostDashboardProps) => {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeValue>("last_6");

  const historyView = useMemo(() => {
    if (range === "this_month") return history.slice(-1);
    if (range === "last_3") return history.slice(-3);
    if (range === "last_6") return history.slice(-6);
    if (range === "last_year") return history.slice(-12);
    return history;
  }, [history, range]);

  const current = summary?.total_monthly ?? 0;
  const previous = history.length > 1 ? history[history.length - 2]?.total ?? 0 : 0;
  const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const changeUp = changePct > 0;
  const currency = summary?.currency || "USD";

  const maxPoint = useMemo(() => {
    const point = historyView.reduce<{ month: string; total: number }>(
      (acc, item) => (item.total > acc.total ? { month: item.month, total: item.total } : acc),
      { month: "-", total: 0 },
    );
    return point;
  }, [historyView]);

  const providerRows = (summary?.by_provider ?? []).slice().sort((a, b) => b.amount - a.amount);
  const donutData = providerRows.filter((item) => item.amount > 0);

  return (
    <section className="grid gap-4 anim-rise">
      <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-4)]" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("analytics.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("analytics.subtitle")}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-1)] px-2 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-[var(--chart-3)]" />
            {t("analytics.designTuned")}
          </div>
        </div>

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
              {t(`analytics.range.${item}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <motion.div
            className="h-64 rounded-xl border border-border/70 bg-[var(--surface-1)] p-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.monthlyTrend")}</p>
            <p className="sr-only">Area chart showing monthly cost movement.</p>
            <ResponsiveContainer>
              <AreaChart data={historyView}>
                <defs>
                  <linearGradient id="costAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" vertical={false} opacity={0.28} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                />
                <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), currency)} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-1)"
                  strokeWidth={2.4}
                  fill="url(#costAreaFill)"
                  dot={{ r: 2, strokeWidth: 0, fill: "var(--chart-1)" }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.providerShare")}</p>
            <div className="h-44">
              <p className="sr-only">Donut chart showing provider cost share.</p>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="amount"
                    nameKey="provider"
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={entry.provider} fill={colorAt(index)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number | string | undefined) => formatCurrency(Number(value ?? 0), currency)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {providerRows.slice(0, 7).map((entry, index) => (
                <div key={entry.provider} className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorAt(index) }} />
                      <span className="font-medium uppercase tracking-[0.07em]">{entry.provider}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {Math.round(entry.percentage_of_total)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${entry.amount > 0 ? Math.max(4, Math.round(entry.percentage_of_total)) : 2}%`,
                        backgroundColor: colorAt(index),
                        opacity: entry.amount > 0 ? 1 : 0.35,
                      }}
                    />
                  </div>
                  <p className="text-right text-muted-foreground">{formatCurrency(entry.amount, currency)}</p>
                </div>
              ))}
            </div>
            {providerRows.length > 1 && donutData.length <= 1 ? (
              <p className="mt-2 rounded-lg border border-border/70 bg-[var(--surface-2)] px-2 py-1.5 text-[11px] text-muted-foreground">
                {t("analytics.costCoverageNote")}
              </p>
            ) : null}
          </motion.div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.currentMonth")}</p>
          <p className="text-xl font-semibold tracking-tight">{formatCurrency(current, currency)}</p>
        </Card>
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.previousMonth")}</p>
          <p className="text-xl font-semibold tracking-tight">{formatCurrency(previous, currency)}</p>
        </Card>
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.momChange")}</p>
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-lg font-semibold ${
              changeUp ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"
            }`}
          >
            {changeUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {Math.abs(changePct).toFixed(1)}%
          </div>
        </Card>
        <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.peakInRange")}</p>
          <p className="text-xl font-semibold tracking-tight">{formatCurrency(maxPoint.total, currency)}</p>
          <p className="text-xs text-muted-foreground">{maxPoint.month}</p>
        </Card>
      </div>

      <PaceIndicator pace={pace} />
    </section>
  );
};
