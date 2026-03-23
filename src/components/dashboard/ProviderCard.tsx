import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Bot,
  Brain,
  Cpu,
  Github,
  MousePointerClick,
  BrainCircuit,
  Sparkles,
  MoreHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { DashboardEntry, UsageTrack } from "@/hooks/useProvider";

interface ProviderCardProps {
  entry: DashboardEntry;
  onSetup: (providerId: string) => void;
  onOpenSettings: (providerId: string) => void;
}

interface DataStatusMeta {
  label: string;
  toneClass: string;
  dotClass: string;
}

interface QuotaStatusMeta {
  label: string;
  toneClass: string;
  dotClass: string;
}

interface StatusSummaryMeta {
  label: string;
  toneClass: string;
}

type Translator = (key: string, options?: Record<string, unknown>) => string;

const iconMap = {
  codex: Bot,
  claude: Brain,
  gemini: Sparkles,
  kiro: Cpu,
  copilot: Github,
  cursor: MousePointerClick,
  jetbrains: BrainCircuit,
} as const;

interface ProviderAccent {
  stripeClass: string;
  iconClass: string;
  modelClass: string;
  trackClass: string;
}

const providerAccentMap: Record<string, ProviderAccent> = {
  codex: {
    stripeClass: "from-emerald-500 via-teal-500 to-cyan-500",
    iconClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
    modelClass: "border-emerald-500/30 bg-emerald-500/10",
    trackClass: "border-emerald-500/20 bg-emerald-500/5",
  },
  claude: {
    stripeClass: "from-amber-500 via-orange-500 to-rose-500",
    iconClass: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
    modelClass: "border-amber-500/30 bg-amber-500/10",
    trackClass: "border-amber-500/20 bg-amber-500/5",
  },
  gemini: {
    stripeClass: "from-blue-500 via-indigo-500 to-violet-500",
    iconClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200",
    modelClass: "border-indigo-500/30 bg-indigo-500/10",
    trackClass: "border-indigo-500/20 bg-indigo-500/5",
  },
  kiro: {
    stripeClass: "from-orange-500 via-amber-500 to-yellow-500",
    iconClass: "bg-orange-500/15 text-orange-700 dark:text-orange-200",
    modelClass: "border-orange-500/30 bg-orange-500/10",
    trackClass: "border-orange-500/20 bg-orange-500/5",
  },
  copilot: {
    stripeClass: "from-sky-500 via-blue-500 to-indigo-500",
    iconClass: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
    modelClass: "border-blue-500/30 bg-blue-500/10",
    trackClass: "border-blue-500/20 bg-blue-500/5",
  },
  cursor: {
    stripeClass: "from-fuchsia-500 via-pink-500 to-rose-500",
    iconClass: "bg-pink-500/15 text-pink-700 dark:text-pink-200",
    modelClass: "border-pink-500/30 bg-pink-500/10",
    trackClass: "border-pink-500/20 bg-pink-500/5",
  },
  jetbrains: {
    stripeClass: "from-red-500 via-orange-500 to-yellow-500",
    iconClass: "bg-red-500/15 text-red-700 dark:text-red-200",
    modelClass: "border-red-500/30 bg-red-500/10",
    trackClass: "border-red-500/20 bg-red-500/5",
  },
};

const providerQuotaModelKey: Record<string, string> = {
  codex: "dashboard.providerCard.quotaModels.codex",
  claude: "dashboard.providerCard.quotaModels.claude",
  gemini: "dashboard.providerCard.quotaModels.gemini",
  kiro: "dashboard.providerCard.quotaModels.kiro",
  copilot: "dashboard.providerCard.quotaModels.copilot",
  cursor: "dashboard.providerCard.quotaModels.cursor",
  jetbrains: "dashboard.providerCard.quotaModels.jetbrains",
};

const getQuotaColor = (ratio: number): string => {
  if (ratio < 0.6) return "quota-meter-safe";
  if (ratio < 0.8) return "quota-meter-warn";
  if (ratio < 0.95) return "quota-meter-danger";
  return "quota-meter-critical";
};

const AnimatedNumber = ({ value }: { value: number }) => {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (latest) => Math.round(latest));

  motionValue.set(value);
  return <motion.span>{display}</motion.span>;
};

const getResetCountdown = (resetAt: string, t: Translator): string => {
  if (!resetAt) {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(resetAt)) {
    // Date-only values are not precise enough for hour-level countdown.
    return resetAt;
  }

  let targetMs: number | null = null;
  if (/^\d{2}\/\d{2}$/.test(resetAt)) {
    const [monthStr, dayStr] = resetAt.split("/");
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isNaN(month) && !Number.isNaN(day)) {
      const now = new Date();
      const candidate = new Date(now.getFullYear(), month - 1, day, 23, 59, 59);
      if (candidate.getTime() < now.getTime()) {
        candidate.setFullYear(now.getFullYear() + 1);
      }
      targetMs = candidate.getTime();
    }
  } else {
    const parsed = new Date(resetAt).getTime();
    if (!Number.isNaN(parsed)) {
      targetMs = parsed;
    }
  }

  if (targetMs == null) {
    return resetAt;
  }

  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) {
    return t("dashboard.providerCard.resetSoon");
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return t("dashboard.providerCard.countdownDaysHours", { days, hours: hours % 24 });
  }
  return t("dashboard.providerCard.countdownHours", { hours });
};

const trackPercent = (track: UsageTrack): number => {
  if (track.limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((track.used / track.limit) * 100));
};

const formatTrackUsage = (track: UsageTrack): string => {
  const used = track.used.toLocaleString();
  if (track.limit > 0) {
    return `${used} / ${track.limit.toLocaleString()} ${track.unit}`;
  }
  return `${used} ${track.unit}`;
};

const formatAuthMethod = (value: string, t: Translator): string => {
  switch (value) {
    case "api_key":
      return t("dashboard.providerCard.auth.apiKey");
    case "oauth":
      return t("dashboard.providerCard.auth.oauth");
    case "token":
      return t("dashboard.providerCard.auth.token");
    case "none":
      return t("dashboard.providerCard.auth.none");
    default:
      return value;
  }
};

const getQuotaModelLabel = (providerId: string, t: Translator): string => {
  const key = providerQuotaModelKey[providerId] ?? "dashboard.providerCard.quotaModels.default";
  return t(key);
};

const getDataStatusBadge = (entry: DashboardEntry, t: Translator): DataStatusMeta => {
  if (entry.usage.status === "not_configured") {
      return {
        label: t("dashboard.providerCard.dataStatus.notConfigured"),
        toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
        dotClass: "bg-slate-400",
      };
  }
  if (entry.stale) {
      return {
        label: t("dashboard.providerCard.dataStatus.stale"),
        toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        dotClass: "bg-amber-500",
      };
  }
  if (entry.health.reachable) {
      return {
        label: t("dashboard.providerCard.dataStatus.live"),
        toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        dotClass: "bg-emerald-500",
      };
  }
  return {
    label: t("dashboard.providerCard.dataStatus.offline"),
    toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClass: "bg-rose-500",
  };
};

const getQuotaStatusBadge = (
  entry: DashboardEntry,
  ratio: number | null,
  t: Translator,
): QuotaStatusMeta => {
  if (entry.usage.status === "not_configured") {
    return {
      label: t("dashboard.providerCard.quotaStatus.notConfigured"),
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
      dotClass: "bg-slate-400",
    };
  }

  if (ratio == null) {
    return {
      label: t("dashboard.providerCard.quotaStatus.unknown"),
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
      dotClass: "bg-slate-400",
    };
  }

  if (ratio >= 1) {
    return {
      label: t("dashboard.providerCard.quotaStatus.exhausted"),
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      dotClass: "bg-rose-500",
    };
  }

  if (ratio >= 0.95) {
    return {
      label: t("dashboard.providerCard.quotaStatus.critical"),
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      dotClass: "bg-rose-500",
    };
  }

  if (ratio >= 0.8) {
    return {
      label: t("dashboard.providerCard.quotaStatus.warning"),
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      dotClass: "bg-amber-500",
    };
  }

  return {
    label: t("dashboard.providerCard.quotaStatus.healthy"),
    toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  };
};

const getStatusSummary = (entry: DashboardEntry, t: Translator): StatusSummaryMeta => {
  if (entry.usage.status === "not_configured") {
    return {
      label: t("dashboard.providerCard.statusSummary.notConfigured"),
      toneClass: "text-slate-600 dark:text-slate-300",
    };
  }
  if (entry.stale) {
    return {
      label: t("dashboard.providerCard.statusSummary.stale"),
      toneClass: "text-amber-700 dark:text-amber-300",
    };
  }
  if (!entry.health.reachable) {
    return {
      label: t("dashboard.providerCard.statusSummary.offline"),
      toneClass: "text-rose-700 dark:text-rose-300",
    };
  }
  return {
    label: t("dashboard.providerCard.statusSummary.live"),
    toneClass: "text-emerald-700 dark:text-emerald-300",
  };
};

export const ProviderCard = ({ entry, onSetup, onOpenSettings }: ProviderCardProps) => {
  const { t, i18n } = useTranslation();
  const Icon = iconMap[entry.info.id as keyof typeof iconMap] ?? Bot;
  const locale = i18n.language.startsWith("ko") ? "ko-KR" : "en-US";

  const subscriptionTracks = useMemo(() => {
    return entry.tracks.filter(
      (track) => track.kind === "subscription" && track.status !== "not_configured",
    );
  }, [entry.tracks]);

  const accent =
    providerAccentMap[entry.info.id] ?? {
      stripeClass: "from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-3)]",
      iconClass: "bg-[var(--surface-1)] text-primary",
      modelClass: "border-border/70 bg-[var(--surface-1)]",
      trackClass: "border-border/60 bg-[var(--surface-1)]",
    };
  const primaryTrack = subscriptionTracks[0] ?? null;
  const quotaModelLabel = getQuotaModelLabel(entry.info.id, t);
  const apiTrack = useMemo(
    () => entry.tracks.find((track) => track.kind === "api"),
    [entry.tracks],
  );
  const showApiPanel = apiTrack != null;
  const quotaRatio =
    primaryTrack != null && primaryTrack.limit > 0
      ? primaryTrack.used / primaryTrack.limit
      : 0;
  const quotaPct = Math.min(100, Math.round(quotaRatio * 100));

  const isNotConfigured = entry.usage.status === "not_configured";
  const dataStatusBadge = getDataStatusBadge(entry, t);
  const quotaStatusRatio =
    primaryTrack != null && primaryTrack.limit > 0
      ? Math.max(0, primaryTrack.used / primaryTrack.limit)
      : entry.quota.limit > 0
        ? Math.max(0, entry.quota.used / entry.quota.limit)
        : null;
  const quotaStatusBadge = getQuotaStatusBadge(entry, quotaStatusRatio, t);
  const statusSummary = getStatusSummary(entry, t);
  const planLabel =
    entry.info.plan_name.toLowerCase() === "manual"
      ? t("tray.manual.planNameManual")
      : entry.info.plan_name;

  const costLabel = useMemo(() => {
    if (entry.cost_view.mode === "included") {
      return t("dashboard.providerCard.included");
    }
    if (entry.cost_view.mode !== "metered" || entry.cost_view.total == null) {
      return t("dashboard.providerCard.unavailable");
    }
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: entry.cost_view.currency || "USD",
      minimumFractionDigits: 2,
    }).format(entry.cost_view.total);
  }, [entry.cost_view.currency, entry.cost_view.mode, entry.cost_view.total, locale, t]);
  const primaryUsageLabel =
    primaryTrack == null
      ? isNotConfigured
        ? t("dashboard.providerCard.noDataYet")
        : t("dashboard.providerCard.unavailable")
      : formatTrackUsage(primaryTrack);
  const primaryResetLabel =
    primaryTrack == null || isNotConfigured
      ? "-"
      : getResetCountdown(primaryTrack.reset_at, t);
  const apiSummary = apiTrack
    ? apiTrack.limit > 0 || apiTrack.used > 0
      ? formatTrackUsage(apiTrack)
      : apiTrack.status === "not_configured"
        ? t("dashboard.providerCard.notConfigured")
        : t("dashboard.providerCard.unavailable")
    : t("dashboard.providerCard.unavailable");
  const codexCostScopeNote =
    entry.info.id === "codex" && entry.cost_view.mode === "metered"
      ? t("dashboard.providerCard.codexLocalEstimateScope")
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015, y: -2 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="flex h-full min-h-[380px] flex-col overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:shadow-[var(--shadow-hard)]">
        <div className={`pointer-events-none h-1 bg-gradient-to-r ${accent.stripeClass}`} />
        <CardHeader className="pb-2">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className={`rounded-xl p-2 ${accent.iconClass}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-base font-semibold tracking-tight">{entry.info.name}</CardTitle>
                <CardDescription className="uppercase tracking-[0.08em]">{entry.info.id}</CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("dashboard.providerCard.providerMenu")} className="shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem] max-w-[18rem]">
                <DropdownMenuItem className="whitespace-normal break-words leading-snug" onClick={() => onOpenSettings(entry.info.id)}>
                  {t("dashboard.providerCard.providerSettings")}
                </DropdownMenuItem>
                <DropdownMenuItem className="whitespace-normal break-words leading-snug" onClick={() => onSetup(entry.info.id)}>
                  {t("dashboard.providerCard.setupCredential")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-1 flex min-h-8 flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="max-w-full truncate korean-keep">
              {planLabel}
            </Badge>
            <Badge variant="outline" className="max-w-full truncate korean-keep">
              {formatAuthMethod(entry.info.auth_method, t)}
            </Badge>
            <span
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${dataStatusBadge.toneClass}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${dataStatusBadge.dotClass}`} />
              <span className="truncate korean-keep">{dataStatusBadge.label}</span>
            </span>
            <span
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${quotaStatusBadge.toneClass}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${quotaStatusBadge.dotClass}`} />
              <span className="truncate korean-keep">{quotaStatusBadge.label}</span>
            </span>
          </div>
          <div className={`mt-2 rounded-xl border px-3 py-2 ${accent.modelClass}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground korean-keep">
                {t("dashboard.providerCard.quotaModelLabel")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.providerCard.windowCount", { count: subscriptionTracks.length })}
              </p>
            </div>
            <p className="mt-1 text-sm font-semibold korean-keep">{quotaModelLabel}</p>
            <p className={`mt-1 text-xs korean-keep ${statusSummary.toneClass}`}>{statusSummary.label}</p>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {isNotConfigured ? (
              <div className="rounded-xl border border-dashed border-border bg-[var(--surface-1)] p-3">
                <p className="mb-2 text-sm text-muted-foreground korean-keep">{t("dashboard.providerCard.notConfigured")}</p>
                <Button size="sm" onClick={() => onSetup(entry.info.id)}>
                  {t("dashboard.providerCard.setupProvider")}
                </Button>
              </div>
            ) : null}

            {!isNotConfigured && subscriptionTracks.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-[var(--surface-1)] p-3">
                <p className="text-sm text-muted-foreground korean-keep">{t("dashboard.providerCard.noTrackWindows")}</p>
              </div>
            ) : null}

            {!isNotConfigured
              ? subscriptionTracks.map((track) => {
                  const usagePct = trackPercent(track);
                  const usageRatio = track.limit > 0 ? track.used / track.limit : 0;
                  const usageColorClass = getQuotaColor(usageRatio);
                  return (
                    <Tooltip key={track.id}>
                      <TooltipTrigger asChild>
                        <div className={`rounded-xl border p-3 ${accent.trackClass}`}>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="min-w-0 truncate korean-keep">{track.label || t("dashboard.providerCard.usageWindow")}</span>
                            <span>{usagePct}%</span>
                          </div>
                          <progress
                            className={`quota-meter h-2 w-full rounded-full ${usageColorClass}`}
                            max={100}
                            value={usagePct}
                            aria-label={`${track.label} ${t("dashboard.providerCard.primaryUsage")}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={usagePct}
                          />
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate font-medium" title={formatTrackUsage(track)}>
                              {formatTrackUsage(track)}
                            </span>
                            <span className="shrink-0 text-muted-foreground korean-keep">
                              {t("dashboard.providerCard.resetIn", { value: getResetCountdown(track.reset_at, t) })}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {t("dashboard.providerCard.period")}: {entry.usage.period_start || "-"} ~ {track.reset_at || "-"}
                        </p>
                        <p className="text-xs">{t("dashboard.providerCard.source")}: {track.source}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-xs text-muted-foreground korean-keep">
                {primaryTrack?.label || t("dashboard.providerCard.primaryWindow")}
              </p>
              <p className="text-base font-semibold">
                <AnimatedNumber value={isNotConfigured ? 0 : quotaPct} />%
              </p>
            </div>
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-xs text-muted-foreground korean-keep">{t("dashboard.providerCard.costPerMonth")}</p>
              <p className="text-base font-semibold">{isNotConfigured ? "-" : costLabel}</p>
              {codexCostScopeNote ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground korean-keep">
                  {codexCostScopeNote}
                </p>
              ) : null}
              {!codexCostScopeNote && entry.cost_view.note && !isNotConfigured ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground korean-keep">
                  {entry.cost_view.note}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-xs text-muted-foreground korean-keep">{t("dashboard.providerCard.primaryUsage")}</p>
              <p className="text-base font-semibold truncate" title={primaryUsageLabel}>
                {primaryUsageLabel}
              </p>
            </div>
            <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <p className="text-xs text-muted-foreground korean-keep">{t("dashboard.providerCard.resetInLabel")}</p>
              <p className="text-base font-semibold">{primaryResetLabel}</p>
            </div>
          </div>

          <div className="space-y-2">
            {showApiPanel ? (
              <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5 text-xs">
                <p className="mb-1 text-muted-foreground korean-keep">{t("dashboard.providerCard.apiTrack")}</p>
                <p className="font-medium">{apiSummary}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5 text-xs">
              <p className="text-muted-foreground korean-keep">{t("dashboard.providerCard.lastChecked")}</p>
              <p className="font-medium">{new Date(entry.health.last_checked).toLocaleString(locale)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
