import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";
import type { DashboardEntry } from "@/hooks/useProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CostSummaryProps {
  entries: DashboardEntry[];
}

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
];

export const CostSummary = ({ entries }: CostSummaryProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";
  const data = entries
    .map((entry) => ({
      name: entry.info.name,
      value:
        entry.cost_view.mode === "metered" && entry.cost_view.total != null
          ? entry.cost_view.total
          : 0,
    }))
    .filter((item) => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const meteredCount = data.length;
  const includedCount = entries.filter((entry) => entry.cost_view.mode === "included").length;
  const unavailableCount = entries.filter((entry) => entry.cost_view.mode === "unavailable").length;
  const totalLabel = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(total);

  return (
    <Card className="flex h-full min-h-[260px] border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
      <CardHeader>
        <CardTitle>{t("dashboard.costSummary.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid flex-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">{t("dashboard.costSummary.monthlyTotal")}</p>
          <p className="text-3xl font-semibold">{totalLabel}</p>
          <p className="mt-2 text-sm text-muted-foreground korean-keep">
            {t("dashboard.costSummary.coverage", {
              metered: meteredCount,
              included: includedCount,
              unavailable: unavailableCount,
            })}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-muted-foreground">{t("dashboard.costSummary.metered")}</p>
              <p className="mt-1 text-sm font-semibold">{meteredCount}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-muted-foreground">{t("dashboard.costSummary.included")}</p>
              <p className="mt-1 text-sm font-semibold">{includedCount}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-muted-foreground">{t("dashboard.costSummary.unavailable")}</p>
              <p className="mt-1 text-sm font-semibold">{unavailableCount}</p>
            </div>
          </div>
        </div>
        <div className="h-52 min-h-[13rem]">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-[var(--surface-1)] p-4 text-center text-sm text-muted-foreground korean-keep">
              {t("dashboard.costSummary.noMeteredData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {data.map((_, index) => (
                    <Cell key={`slice-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | string | undefined) =>
                    new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency: "USD",
                    }).format(typeof value === "number" ? value : 0)
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
