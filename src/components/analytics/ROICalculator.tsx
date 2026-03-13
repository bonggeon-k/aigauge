import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RoiAnalysis } from "@/hooks/useCostAnalytics";

interface ROICalculatorProps {
  roi: RoiAnalysis | null;
}

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

export const ROICalculator = ({ roi }: ROICalculatorProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";

  const formatMoney = (value: number): string =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(value);

  if (!roi) {
    return (
      <Card className="h-full border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-muted-foreground">{t("analytics.roi.noData")}</p>
      </Card>
    );
  }

  const ranked = [...roi.entries].sort((a, b) => b.efficiency_score - a.efficiency_score);
  const avgEfficiency =
    ranked.length > 0 ? ranked.reduce((acc, entry) => acc + entry.efficiency_score, 0) / ranked.length : 0;

  return (
    <Card className="flex h-full min-h-[26rem] flex-col space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)] xl:min-h-[34rem]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{t("analytics.roi.title")}</h3>
        {roi.best_value_provider ? (
          <Badge className="bg-[var(--chart-6)] text-black">
            {roi.best_value_provider} {t("analytics.roi.bestValueSuffix")}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs">
          <p className="text-muted-foreground">{t("analytics.roi.table.efficiency")}</p>
          <p className="text-sm font-semibold">{avgEfficiency.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs">
          <p className="text-muted-foreground">{t("analytics.roi.costPerRequest")}</p>
          <p className="text-sm font-semibold">{formatMoney(ranked[0]?.cost_per_request ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs">
          <p className="text-muted-foreground">{t("analytics.roi.costPer1kTokens")}</p>
          <p className="text-sm font-semibold">{formatMoney(ranked[0]?.cost_per_1k_tokens ?? 0)}</p>
        </div>
      </div>

      <div className="analytics-chart-frame h-52 shrink-0 rounded-xl border border-border/70 bg-[var(--surface-1)] p-3 xl:h-56">
        <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{t("analytics.roi.snapshot")}</p>
        <p className="sr-only">{t("analytics.a11y.roiChart")}</p>
        <ResponsiveContainer>
          <BarChart data={roi.entries} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} opacity={0.26} />
            <XAxis dataKey="provider" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={58} />
            <Tooltip
              cursor={{ fill: "transparent", stroke: "transparent" }}
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              formatter={(value: number | string | undefined) => formatMoney(Number(value ?? 0))}
            />
            <Bar dataKey="cost_per_request" name={t("analytics.roi.costPerRequest")} fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="cost_per_1k_tokens" name={t("analytics.roi.costPer1kTokens")} fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="min-h-[10rem] flex-1 overflow-auto rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 pl-2">{t("analytics.roi.table.provider")}</th>
              <th className="pb-2">{t("analytics.roi.table.req")}</th>
              <th className="pb-2">{t("analytics.roi.table.tokens")}</th>
              <th className="pb-2">{t("analytics.roi.table.efficiency")}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, index) => (
              <tr key={entry.provider} className="border-t border-border/60 transition-colors hover:bg-[var(--surface-2)]">
                <td className="py-2 pl-2 font-medium uppercase tracking-[0.08em]">
                  {index + 1}. {entry.provider}
                </td>
                <td className="py-2">{formatMoney(entry.cost_per_request)}</td>
                <td className="py-2">{formatMoney(entry.cost_per_1k_tokens)}</td>
                <td className="py-2">{entry.efficiency_score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
