import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import type { PaceAnalysis } from "@/hooks/useCostAnalytics";

interface PaceIndicatorProps {
  pace: PaceAnalysis | null;
}

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;

export const PaceIndicator = ({ pace }: PaceIndicatorProps) => {
  const { t } = useTranslation();
  if (!pace) {
    return (
      <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-muted-foreground">{t("analytics.pace.noData")}</p>
      </Card>
    );
  }

  const ratio =
    pace.monthly_budget > 0
      ? pace.projected_monthly_total / pace.monthly_budget
      : 0;
  const width = Math.max(0, Math.min(100, ratio * 100));
  const status = pace.on_track ? t("analytics.pace.onTrack") : t("analytics.pace.overBudget");
  const Icon = pace.on_track ? CheckCircle2 : AlertTriangle;
  const tone = pace.on_track
    ? "text-emerald-600 dark:text-emerald-300"
    : "text-rose-600 dark:text-rose-300";

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - now.getDate());

  return (
    <Card className="space-y-4 border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}>
          <Icon className="h-4 w-4" />
          {status}
        </div>
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {t("analytics.pace.daysRemaining", { count: daysRemaining })}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("analytics.pace.projectedAgainstBudget")}</span>
          <span>{Math.round(ratio * 100)}%</span>
        </div>
        <progress
          className="quota-meter quota-meter-pace h-2.5 w-full rounded-full"
          max={100}
          value={width}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-xs">
        <div className="rounded-lg bg-[var(--surface-1)] px-3 py-2">
          <p className="text-muted-foreground">{t("analytics.pace.spentSoFar")}</p>
          <p className="text-sm font-semibold">{formatMoney(pace.spent_so_far)}</p>
        </div>
        <div className="rounded-lg bg-[var(--surface-1)] px-3 py-2">
          <p className="text-muted-foreground">{t("analytics.pace.projected")}</p>
          <p className="text-sm font-semibold">{formatMoney(pace.projected_monthly_total)}</p>
        </div>
        <div className="rounded-lg bg-[var(--surface-1)] px-3 py-2">
          <p className="text-muted-foreground">{t("analytics.pace.budget")}</p>
          <p className="text-sm font-semibold">{formatMoney(pace.monthly_budget)}</p>
        </div>
      </div>
    </Card>
  );
};
