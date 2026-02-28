import { motion } from "framer-motion";
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

const formatMoney = (value: number): string => `$${value.toFixed(4)}`;

export const ROICalculator = ({ roi }: ROICalculatorProps) => {
  const { t } = useTranslation();
  if (!roi) {
    return (
      <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-muted-foreground">{t("analytics.roi.noData")}</p>
      </Card>
    );
  }

  const ranked = [...roi.entries].sort(
    (a, b) => b.efficiency_score - a.efficiency_score,
  );

  return (
    <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
      <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-2)] via-[var(--chart-3)] to-[var(--chart-5)]" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{t("analytics.roi.title")}</h3>
        {roi.best_value_provider ? (
          <Badge className="bg-[var(--chart-6)] text-black">
            {roi.best_value_provider} {t("analytics.roi.bestValueSuffix")}
          </Badge>
        ) : null}
      </div>

      <motion.div
        className="h-64 rounded-xl border border-border/70 bg-[var(--surface-1)] p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {t("analytics.roi.snapshot")}
        </p>
        <p className="sr-only">Grouped bar chart comparing request and token costs.</p>
        <ResponsiveContainer>
          <BarChart data={roi.entries}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} opacity={0.26} />
            <XAxis dataKey="provider" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={58} />
            <Tooltip formatter={(value: number | string | undefined) => formatMoney(Number(value ?? 0))} />
            <Bar
              dataKey="cost_per_request"
              name={t("analytics.roi.costPerRequest")}
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="cost_per_1k_tokens"
              name={t("analytics.roi.costPer1kTokens")}
              fill="var(--chart-3)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5">
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
              <tr key={entry.provider} className="border-t border-border/60">
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
