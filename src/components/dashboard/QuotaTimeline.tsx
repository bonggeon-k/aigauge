import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuotaTimelineProps {
  used: number;
  limit: number;
  periodStart?: string;
  periodEnd?: string;
  resetAt?: string;
  resetPeriod?: string;
}

type PaceState = {
  labelKey: string;
  tone: string;
  hintKey: string;
};

const getPace = (usedRatio: number, elapsedRatio: number): PaceState => {
  if (usedRatio > elapsedRatio * 1.1) {
    return {
      labelKey: "dashboard.quotaTimeline.pace.atRisk.label",
      tone: "text-[var(--quota-danger)]",
      hintKey: "dashboard.quotaTimeline.pace.atRisk.hint",
    };
  }
  if (usedRatio < elapsedRatio * 0.9) {
    return {
      labelKey: "dashboard.quotaTimeline.pace.belowPlan.label",
      tone: "text-[var(--quota-safe)]",
      hintKey: "dashboard.quotaTimeline.pace.belowPlan.hint",
    };
  }
  return {
    labelKey: "dashboard.quotaTimeline.pace.onTrack.label",
    tone: "text-[var(--quota-warn)]",
    hintKey: "dashboard.quotaTimeline.pace.onTrack.hint",
  };
};

export const QuotaTimeline = ({
  used,
  limit,
  periodStart,
  periodEnd,
  resetAt,
  resetPeriod,
}: QuotaTimelineProps) => {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState<number>(() => Date.now());
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const parseDate = (value?: string): number | null => {
    if (!value) return null;
    if (/^\d{2}\/\d{2}$/.test(value)) {
      const [monthString, dayString] = value.split("/");
      const month = Number(monthString);
      const day = Number(dayString);
      if (Number.isNaN(month) || Number.isNaN(day)) return null;
      const candidate = new Date(now);
      candidate.setMonth(month - 1, day);
      candidate.setHours(23, 59, 59, 0);
      if (candidate.getTime() < now) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      return candidate.getTime();
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const inferDurationMs = (period?: string, endMs?: number): number => {
    const normalized = (period ?? "").trim().toLowerCase();
    if (normalized === "daily") return 24 * 60 * 60 * 1000;
    if (normalized === "weekly") return 7 * 24 * 60 * 60 * 1000;
    if (normalized === "monthly" && typeof endMs === "number") {
      const endDate = new Date(endMs);
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 1);
      const span = endDate.getTime() - startDate.getTime();
      return span > 0 ? span : 30 * 24 * 60 * 60 * 1000;
    }
    if (normalized === "rolling") return 5 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
  };

  const resolvedEnd = parseDate(periodEnd) ?? parseDate(resetAt) ?? now;
  const resolvedStart =
    parseDate(periodStart) ?? (resolvedEnd - inferDurationMs(resetPeriod, resolvedEnd));

  const elapsedRatio =
    resolvedEnd > resolvedStart
      ? Math.max(0, Math.min(1, (now - resolvedStart) / (resolvedEnd - resolvedStart)))
      : 0;
  const elapsedMs = Math.max(0, now - resolvedStart);
  const usedRatio = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;

  const projectionReady = elapsedRatio >= 0.1 || elapsedMs >= 6 * 60 * 60 * 1000;
  const projected = projectionReady && elapsedRatio > 0 ? Math.round(used / elapsedRatio) : null;
  const projectedRatio = projected != null && limit > 0 ? (projected / limit) * 100 : 0;
  const pace = projectionReady
    ? getPace(usedRatio, elapsedRatio)
    : {
        labelKey: "dashboard.quotaTimeline.pace.unknown.label",
        tone: "text-muted-foreground",
        hintKey: "dashboard.quotaTimeline.pace.unknown.hint",
      };
  const projectedText =
    projected == null
      ? t("dashboard.quotaTimeline.projectedPending")
      : limit > 0
      ? `${projected.toLocaleString(locale)} / ${limit.toLocaleString(locale)} (${Math.round(projectedRatio)}%)`
      : projected.toLocaleString(locale);

  return (
    <Card className="flex h-full min-h-[260px] border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
      <CardHeader>
        <CardTitle>{t("dashboard.quotaTimeline.title")}</CardTitle>
        <p className="text-xs text-muted-foreground korean-keep">
          {t("dashboard.quotaTimeline.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t("dashboard.quotaTimeline.timeElapsed")}</span>
            <span>{Math.round(elapsedRatio * 100)}%</span>
          </div>
          <progress
            className="quota-meter quota-meter-time h-2 w-full rounded-full"
            max={100}
            value={Math.round(elapsedRatio * 100)}
            aria-label={t("dashboard.quotaTimeline.timeElapsed")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsedRatio * 100)}
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t("dashboard.quotaTimeline.usageConsumed")}</span>
            <span>{Math.round(usedRatio * 100)}%</span>
          </div>
          <progress
            className="quota-meter quota-meter-primary h-2 w-full rounded-full"
            max={100}
            value={Math.round(usedRatio * 100)}
            aria-label={t("dashboard.quotaTimeline.usageConsumed")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedRatio * 100)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className={`font-medium ${pace.tone}`} title={t(pace.hintKey)}>
              {t(pace.labelKey)}
            </p>
            <p className="text-xs text-muted-foreground korean-keep">{t(pace.hintKey)}</p>
          </div>
          <p className="max-w-[58%] text-right text-muted-foreground korean-keep" title={t("dashboard.quotaTimeline.projectedTooltip")}>
            {t("dashboard.quotaTimeline.projectedEndUsage", { value: projectedText })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
