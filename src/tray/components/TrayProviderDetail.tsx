import { AlertTriangle, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DashboardEntry } from "@/hooks/useProvider";
import type { CodexCostBreakdown } from "@/tray/hooks/useTrayProviders";

interface TrayProviderDetailProps {
  entry: DashboardEntry;
  status?: { indicator: string; description: string };
  codexCost?: CodexCostBreakdown | null;
  onOpenManualInput: () => void;
}

type Translator = (key: string, options?: Record<string, unknown>) => string;

interface StatusMeta {
  label: string;
  dotClass: string;
  toneClass: string;
}

interface DataStatusMeta {
  label: string;
  toneClass: string;
}

interface QuotaStatusMeta {
  label: string;
  dotClass: string;
  toneClass: string;
}

const normalizeServiceIndicator = (indicator?: string, description?: string): string => {
  const normalized = (indicator ?? "").trim().toLowerCase();
  if (normalized && normalized !== "unknown") {
    return normalized;
  }

  const details = (description ?? "").trim().toLowerCase();
  if (
    details.includes("no incidents") ||
    details.includes("no disruptions") ||
    details.includes("reachable")
  ) {
    return "none";
  }
  if (details.includes("degraded") || details.includes("partial")) {
    return "minor";
  }
  if (details.includes("outage") || details.includes("incident")) {
    return "major";
  }

  return "unknown";
};

const serviceStatusMeta = (indicator: string | undefined, description: string | undefined, t: Translator): StatusMeta => {
  const normalized = normalizeServiceIndicator(indicator, description);
  if (normalized === "major" || normalized === "critical" || normalized === "major_outage") {
    return {
      label: t("tray.provider.serviceStatus.disrupted"),
      dotClass: "bg-rose-500",
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }
  if (normalized === "minor" || normalized === "degraded" || normalized === "partial_outage") {
    return {
      label: t("tray.provider.serviceStatus.degraded"),
      dotClass: "bg-amber-500",
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (normalized === "none" || normalized === "ok" || normalized === "operational") {
    return {
      label: t("tray.provider.serviceStatus.operational"),
      dotClass: "bg-emerald-500",
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: t("tray.provider.serviceStatus.unknown"),
    dotClass: "bg-slate-400",
    toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
  };
};

const dataStateMeta = (entry: DashboardEntry, t: Translator): DataStatusMeta => {
  if (entry.usage.status === "not_configured") {
    return {
      label: t("tray.provider.dataStatus.notConfigured"),
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
    };
  }
  if (entry.stale) {
    return {
      label: t("tray.provider.dataStatus.stale"),
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (entry.health.reachable) {
    return {
      label: t("tray.provider.dataStatus.live"),
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: t("tray.provider.dataStatus.offline"),
    toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
};

const quotaStatusMeta = (
  entry: DashboardEntry,
  ratio: number | null,
  t: Translator,
): QuotaStatusMeta => {
  if (entry.usage.status === "not_configured") {
    return {
      label: t("tray.provider.quotaStatus.notConfigured"),
      dotClass: "bg-slate-400",
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
    };
  }
  if (ratio == null) {
    return {
      label: t("tray.provider.quotaStatus.unknown"),
      dotClass: "bg-slate-400",
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
    };
  }
  if (ratio >= 1) {
    return {
      label: t("tray.provider.quotaStatus.exhausted"),
      dotClass: "bg-rose-500",
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }
  if (ratio >= 0.95) {
    return {
      label: t("tray.provider.quotaStatus.critical"),
      dotClass: "bg-rose-500",
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }
  if (ratio >= 0.8) {
    return {
      label: t("tray.provider.quotaStatus.warning"),
      dotClass: "bg-amber-500",
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: t("tray.provider.quotaStatus.healthy"),
    dotClass: "bg-emerald-500",
    toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
};

const barColorClass = (remainingPct: number): string => {
  if (remainingPct > 50) return "quota-meter-safe";
  if (remainingPct > 20) return "quota-meter-warn";
  return "quota-meter-critical";
};

const trackPercent = (used: number, limit: number): number => {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
};

const trackUsageLabel = (used: number, limit: number, unit: string): string => {
  if (limit > 0) {
    return `${used.toLocaleString()} / ${limit.toLocaleString()} ${unit}`;
  }
  return `${used.toLocaleString()} ${unit}`;
};

const parsePeriodTimestamp = (value: string): number | null => {
  if (!value) return null;

  if (/^\d{2}\/\d{2}$/.test(value)) {
    const [monthString, dayString] = value.split("/");
    const month = Number(monthString);
    const day = Number(dayString);
    if (Number.isNaN(month) || Number.isNaN(day)) {
      return null;
    }
    const now = new Date();
    const candidate = new Date(now.getFullYear(), month - 1, day, 23, 59, 59, 0);
    if (candidate.getTime() < now.getTime()) {
      candidate.setFullYear(now.getFullYear() + 1);
    }
    return candidate.getTime();
  }

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
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

const computeElapsedPercentAligned = (
  periodStart: string | undefined,
  periodEnd: string | undefined,
  resetPeriod?: string,
): number | null => {
  const end = parsePeriodTimestamp(periodEnd ?? "");
  if (end == null) {
    return null;
  }

  const startFromPayload = parsePeriodTimestamp(periodStart ?? "");
  const start = startFromPayload ?? (end - inferDurationMs(resetPeriod, end));
  if (end <= start) {
    return null;
  }

  const ratio = (Date.now() - start) / (end - start);
  return Math.max(0, Math.min(100, ratio * 100));
};

const computeCountdown = (resetAt: string, t: Translator): string => {
  if (!resetAt) return "-";

  if (/^\d{4}-\d{2}-\d{2}$/.test(resetAt)) {
    // Date-only values are not precise enough for hour-level countdown.
    return resetAt;
  }

  if (/^\d{2}\/\d{2}$/.test(resetAt)) {
    const [monthStr, dayStr] = resetAt.split("/");
    const month = Number(monthStr);
    const day = Number(dayStr);
    const now = new Date();
    const candidate = new Date(now.getFullYear(), month - 1, day, 23, 59, 59);
    if (candidate < now) {
      candidate.setFullYear(now.getFullYear() + 1);
    }
    const diffMs = candidate.getTime() - now.getTime();
    if (diffMs <= 0) return t("tray.provider.countdown.soon");
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (totalHours < 24) {
      return t("tray.provider.countdown.hours", { hours: Math.max(1, totalHours) });
    }
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (hours > 0) {
      return t("dashboard.providerCard.countdownDaysHours", { days, hours });
    }
    return t("tray.provider.countdown.days", { days });
  }

  const parsed = new Date(resetAt);
  if (Number.isNaN(parsed.getTime())) return resetAt;
  const diffMs = parsed.getTime() - Date.now();
  if (diffMs <= 0) return t("tray.provider.countdown.soon");
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (totalHours < 24) {
    return t("tray.provider.countdown.hours", { hours: Math.max(1, totalHours) });
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours > 0) {
    return t("dashboard.providerCard.countdownDaysHours", { days, hours });
  }
  return t("tray.provider.countdown.days", { days });
};

export const TrayProviderDetail = ({ entry, status, codexCost, onOpenManualInput }: TrayProviderDetailProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";
  const fallbackTrack = {
    id: "subscription:primary",
    kind: "subscription" as const,
    label: t("tray.provider.subscriptionQuota"),
    used: entry.quota.used,
    limit: entry.quota.limit,
    unit: entry.quota.unit,
    reset_at: entry.quota.reset_at || entry.usage.period_end,
    status: entry.quota.status,
    source: "snapshot" as const,
  };
  const subscriptionTracks = entry.tracks.filter((track) => track.kind === "subscription");
  const visibleTracks = (subscriptionTracks.length > 0 ? subscriptionTracks : [fallbackTrack]).slice(0, 2);
  const primaryTrack = visibleTracks[0];
  const apiTrack = entry.tracks.find((track) => track.kind === "api");
  const serviceStatus = serviceStatusMeta(status?.indicator, status?.description, t);
  const dataStatus = dataStateMeta(entry, t);
  const quotaStatusRatio =
    primaryTrack != null && primaryTrack.limit > 0
      ? Math.max(0, primaryTrack.used / primaryTrack.limit)
      : entry.quota.limit > 0
        ? Math.max(0, entry.quota.used / entry.quota.limit)
        : null;
  const quotaStatus = quotaStatusMeta(entry, quotaStatusRatio, t);
  const serviceBadgeLabel = t("tray.provider.badges.serviceStatus", {
    value: serviceStatus.label,
  });
  const dataBadgeLabel = t("tray.provider.badges.dataStatus", {
    value: dataStatus.label,
  });
  const quotaBadgeLabel = t("tray.provider.badges.quotaStatus", {
    value: quotaStatus.label,
  });

  const usedPct = !primaryTrack || primaryTrack.limit <= 0 ? 0 : trackPercent(primaryTrack.used, primaryTrack.limit);

  const remainingPct = Math.max(0, 100 - usedPct);
  const elapsedPct = computeElapsedPercentAligned(
    entry.usage.period_start,
    primaryTrack?.reset_at || entry.usage.period_end,
    entry.info.reset_period,
  );
  const paceLabel =
    elapsedPct == null
      ? "unknown"
      : usedPct > elapsedPct + 10
        ? "behind"
        : usedPct < elapsedPct - 10
          ? "ahead"
          : "onPace";
  const setupGuide = t(`tray.provider.setupGuide.${entry.info.id}`);
  const setupGuideLabel =
    setupGuide === `tray.provider.setupGuide.${entry.info.id}`
      ? t("tray.provider.setupGuide.default")
      : setupGuide;
  const planLabel =
    entry.info.plan_name.toLowerCase() === "manual"
      ? t("tray.manual.planNameManual")
      : entry.info.plan_name;
  const monthlyCost = entry.cost_view.total ??
    (entry.info.id === "codex" ? codexCost?.estimated_cost_usd_30d : undefined) ??
    0;
  const monthlyCostLabel =
    entry.cost_view.mode === "included"
      ? t("dashboard.providerCard.included")
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: entry.cost_view.currency || "USD",
          minimumFractionDigits: 2,
        }).format(monthlyCost);

  if (entry.usage.status === "not_configured") {
    return (
      <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm shadow-[var(--shadow-soft)]">
        <p className="font-medium tracking-tight">{entry.info.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${serviceStatus.toneClass}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${serviceStatus.dotClass}`} />
            {serviceBadgeLabel}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${dataStatus.toneClass}`}>
            {dataBadgeLabel}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${quotaStatus.toneClass}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${quotaStatus.dotClass}`} />
            {quotaBadgeLabel}
          </span>
        </div>
        <p className="mt-2 text-muted-foreground korean-keep">{setupGuideLabel}</p>
        <button
          type="button"
          className="mt-4 rounded-full border border-primary/50 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/10"
          onClick={onOpenManualInput}
        >
          {t("tray.actions.manualInput")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm shadow-[var(--shadow-soft)]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium tracking-tight">{entry.info.name}</p>
          <p className="truncate text-xs text-muted-foreground korean-keep">{planLabel}</p>
        </div>
        <div className="flex max-w-[56%] flex-wrap items-center justify-end gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${serviceStatus.toneClass}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${serviceStatus.dotClass}`} />
            <span className="truncate korean-keep">{serviceBadgeLabel}</span>
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${dataStatus.toneClass}`}>
            <span className="truncate korean-keep">{dataBadgeLabel}</span>
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${quotaStatus.toneClass}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${quotaStatus.dotClass}`} />
            <span className="truncate korean-keep">{quotaBadgeLabel}</span>
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="korean-keep">{t("tray.provider.primaryWindowRemaining")}</span>
          <span>{remainingPct.toFixed(0)}%</span>
        </div>
        <progress
          className={`quota-meter h-2 w-full rounded-full ${barColorClass(remainingPct)}`}
          max={100}
          value={remainingPct}
          aria-label={t("tray.provider.primaryWindowRemaining")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(remainingPct)}
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span className="korean-keep">{t("tray.provider.riskLabel")}</span>
          <span>{t("tray.provider.riskUsed", { value: usedPct.toFixed(0) })}</span>
        </div>
      </div>

      <div className="space-y-2">
        {visibleTracks.map((track) => {
          const pct = trackPercent(track.used, track.limit);
          const remaining = Math.max(0, 100 - pct);
          return (
            <div key={track.id} className="rounded-lg border border-border/60 bg-[var(--surface-2)] p-2.5 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-muted-foreground">{track.label}</p>
                <p className="font-medium">{pct.toFixed(0)}%</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/20">
                <progress
                  className={`quota-meter h-2 w-full rounded-full ${barColorClass(remaining)}`}
                  max={100}
                  value={remaining}
                  aria-label={`${track.label} ${t("tray.provider.primaryWindowRemaining")}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(remaining)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="min-w-0 truncate font-medium">{trackUsageLabel(track.used, track.limit, track.unit)}</p>
                <p className="shrink-0 text-muted-foreground korean-keep">
                  {t("tray.provider.resetIn", { value: computeCountdown(track.reset_at || entry.usage.period_end, t) })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {apiTrack ? (
        <div className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs">
          <p className="mb-1 text-muted-foreground korean-keep">{t("tray.provider.apiTrack")}</p>
          {apiTrack.limit > 0 || apiTrack.used > 0 ? (
            <p className="font-medium">
              {apiTrack.used.toLocaleString()}
              {apiTrack.limit > 0 ? ` / ${apiTrack.limit.toLocaleString()}` : ""} {apiTrack.unit}
            </p>
          ) : (
            <p className="font-medium text-muted-foreground">
              {apiTrack.status === "not_configured"
                ? t("tray.provider.dataStatus.notConfigured")
                : t("tray.provider.unavailable")}
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs">
        {t("tray.provider.paceLabel")}{" "}
        <span
          className={`font-medium ${
            paceLabel === "behind"
              ? "text-rose-500"
              : paceLabel === "ahead"
                ? "text-emerald-500"
                : paceLabel === "onPace"
                  ? "text-amber-500"
                  : "text-muted-foreground"
          }`}
        >
          {t(`tray.provider.pace.${paceLabel}`)}
        </span>
      </div>

      <details className="rounded-lg border border-border/60 bg-[var(--surface-2)] p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
          {t("tray.provider.cost.title")}
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        <div className="mt-2 space-y-2 text-xs">
          {entry.info.id === "codex" ? (
            <div className="space-y-1 text-muted-foreground">
              <p>
                {t("tray.provider.cost.input")}: {codexCost?.input_tokens_30d.toLocaleString(locale) ?? 0} / {t("tray.provider.cost.output")}:{" "}
                {codexCost?.output_tokens_30d.toLocaleString(locale) ?? 0} / {t("tray.provider.cost.reasoning")}:{" "}
                {codexCost?.reasoning_tokens_30d.toLocaleString(locale) ?? 0}
              </p>
              <p>
                {t("tray.provider.cost.sessions")}: {codexCost?.session_files_30d ?? 0} · {t("tray.provider.cost.events")}:{" "}
                {codexCost?.token_events_30d ?? 0}
              </p>
            </div>
          ) : null}
          <p>
            {t("tray.provider.cost.monthly")}: {monthlyCostLabel}
          </p>
          {entry.cost_view.mode === "included" ? (
            <p className="text-muted-foreground korean-keep">{t("tray.provider.cost.noAdditionalCharge")}</p>
          ) : null}
          {entry.info.id === "codex" && codexCost ? (
            <p className="text-muted-foreground">
              {t("tray.provider.cost.apiEquivalent30d", { value: codexCost.estimated_cost_usd_30d.toFixed(2) })}
            </p>
          ) : null}
          {monthlyCost > 500 ? (
            <div className="flex items-center gap-2 text-[var(--quota-critical)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("tray.provider.cost.highCostWarning")}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
};
