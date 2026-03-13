import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
import type { CostSummary, MonthlyCostHistory } from "@/hooks/useCostAnalytics";
import { Card } from "@/components/ui/card";

interface CostDashboardProps {
  summary: CostSummary | null;
  history: MonthlyCostHistory[];
}

const ranges = ["this_month", "last_3", "last_6", "last_year"] as const;
type RangeValue = (typeof ranges)[number];

const colorAt = (index: number): string => `var(--chart-${(index % 7) + 1})`;

const formatCurrency = (value: number, currency = "USD", locale = "en-US"): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const chartTooltipContentStyle = {
  borderRadius: "12px",
  border: "1px solid color-mix(in srgb, var(--color-primary) 28%, transparent)",
  background: "color-mix(in srgb, var(--surface-2) 92%, black 8%)",
  boxShadow: "0 14px 30px color-mix(in srgb, #000 22%, transparent)",
  backdropFilter: "blur(8px)",
  padding: "8px 10px",
  fontSize: "12px",
};

const chartTooltipLabelStyle = {
  color: "var(--muted-foreground)",
  marginBottom: "2px",
};

export const CostDashboard = ({ summary, history }: CostDashboardProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";
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

  const avgInRange =
    historyView.length > 0
      ? historyView.reduce((acc, item) => acc + item.total, 0) / historyView.length
      : 0;

  const maxPoint = useMemo(() => {
    return historyView.reduce<{ month: string; total: number }>(
      (acc, item) => (item.total > acc.total ? { month: item.month, total: item.total } : acc),
      { month: "-", total: 0 },
    );
  }, [historyView]);

  const providerRows = (summary?.by_provider ?? []).slice().sort((a, b) => b.amount - a.amount);
  const donutData = providerRows.filter((item) => item.amount > 0);

  return (
    <section className="grid gap-4 anim-rise">
      <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("analytics.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("analytics.subtitle")}</p>
          </div>
          <div className="analytics-segmented inline-flex items-center gap-1 rounded-full bg-[var(--surface-1)] p-1">
            {ranges.map((item) => {
              const active = range === item;
              return (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--nav-active)] text-[var(--nav-active-fg)] shadow-[0_8px_20px_color-mix(in_srgb,var(--nav-active)_30%,transparent)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setRange(item)}
                >
                  {t(`analytics.range.${item}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="h-full border-border/70 bg-[var(--surface-1)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.currentMonth")}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{formatCurrency(current, currency, locale)}</p>
          </Card>
          <Card className="h-full border-border/70 bg-[var(--surface-1)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.previousMonth")}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{formatCurrency(previous, currency, locale)}</p>
          </Card>
          <Card className="h-full border-border/70 bg-[var(--surface-1)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.avgInRange")}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{formatCurrency(avgInRange, currency, locale)}</p>
          </Card>
          <Card className="h-full border-border/70 bg-[var(--surface-1)] p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.momChange")}</p>
            <div
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold ${
                changeUp ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"
              }`}
            >
              {changeUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(changePct).toFixed(1)}%
            </div>
          </Card>
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-12">
          <Card className="analytics-chart-frame xl:col-span-8 flex h-[21rem] flex-col border-border/70 bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.monthlyTrend")}</p>
              <p className="text-xs text-muted-foreground">{maxPoint.month}</p>
            </div>
            <p className="sr-only">{t("analytics.a11y.monthlyTrendChart")}</p>
            <div className="min-h-0 flex-1">
              {historyView.length > 0 ? (
                <ResponsiveContainer>
                  <AreaChart data={historyView} accessibilityLayer={false}>
                    <defs>
                      <linearGradient id="costAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.48} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} opacity={0.28} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      width={66}
                      tickFormatter={(value) => formatCurrency(Number(value ?? 0), currency, locale)}
                    />
                    <Tooltip
                      cursor={{ fill: "transparent", stroke: "transparent" }}
                      contentStyle={chartTooltipContentStyle}
                      labelStyle={chartTooltipLabelStyle}
                      formatter={(value: number | string | undefined) =>
                        formatCurrency(Number(value ?? 0), currency, locale)
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="var(--chart-1)"
                      strokeWidth={2.4}
                      fill="url(#costAreaFill)"
                      dot={{ r: 2, strokeWidth: 0, fill: "var(--chart-1)" }}
                      activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--background)", strokeWidth: 1.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                  {t("analytics.roi.noData")}
                </div>
              )}
            </div>
          </Card>

          <Card className="analytics-chart-frame xl:col-span-4 flex h-[21rem] flex-col border-border/70 bg-[var(--surface-1)] p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.providerShare")}</p>
            <div className="h-32 shrink-0">
              <p className="sr-only">{t("analytics.a11y.providerShareChart")}</p>
              {donutData.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart accessibilityLayer={false}>
                    <Pie data={donutData} dataKey="amount" nameKey="provider" innerRadius={40} outerRadius={62} paddingAngle={3}>
                      {donutData.map((entry, index) => (
                        <Cell key={entry.provider} fill={colorAt(index)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipContentStyle}
                      labelStyle={chartTooltipLabelStyle}
                      formatter={(value: number | string | undefined) =>
                        formatCurrency(Number(value ?? 0), currency, locale)
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground">
                  {t("analytics.roi.noData")}
                </div>
              )}
            </div>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
              {providerRows.slice(0, 7).map((entry, index) => (
                <div key={entry.provider} className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-2.5 py-2 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorAt(index) }} />
                      <span className="font-medium uppercase tracking-[0.06em]">{entry.provider}</span>
                    </span>
                    <span className="text-muted-foreground">{Math.round(entry.percentage_of_total)}%</span>
                  </div>
                  <progress className="quota-meter h-1.5 w-full rounded-full" max={100} value={Math.max(2, entry.percentage_of_total)} />
                  <p className="mt-1 text-right text-muted-foreground">{formatCurrency(entry.amount, currency, locale)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Card>
    </section>
  );
};
