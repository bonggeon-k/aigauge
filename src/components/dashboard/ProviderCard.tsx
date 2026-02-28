import { useMemo } from "react";
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

const iconMap = {
  codex: Bot,
  claude: Brain,
  gemini: Sparkles,
  kiro: Cpu,
  copilot: Github,
  cursor: MousePointerClick,
  jetbrains: BrainCircuit,
} as const;

const getQuotaColor = (ratio: number): string => {
  if (ratio < 0.6) return "var(--quota-safe)";
  if (ratio < 0.8) return "var(--quota-warn)";
  if (ratio < 0.95) return "var(--quota-danger)";
  return "var(--quota-critical)";
};

const AnimatedNumber = ({ value }: { value: number }) => {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (latest) => Math.round(latest));

  motionValue.set(value);
  return <motion.span>{display}</motion.span>;
};

const getResetCountdown = (resetAt: string): string => {
  if (!resetAt) {
    return "-";
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
    return "Reset soon";
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
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

export const ProviderCard = ({ entry, onSetup, onOpenSettings }: ProviderCardProps) => {
  const Icon = iconMap[entry.info.id as keyof typeof iconMap] ?? Bot;

  const fallbackTrack = useMemo(
    (): UsageTrack => ({
      id: "subscription:primary",
      kind: "subscription",
      label: "Subscription quota",
      used: entry.quota.used,
      limit: entry.quota.limit,
      unit: entry.quota.unit,
      reset_at: entry.quota.reset_at,
      status: entry.quota.status,
      source: "snapshot",
    }),
    [
      entry.quota.limit,
      entry.quota.reset_at,
      entry.quota.status,
      entry.quota.unit,
      entry.quota.used,
    ],
  );

  const subscriptionTracks = useMemo(() => {
    const tracks = entry.tracks.filter((track) => track.kind === "subscription");
    if (tracks.length === 0) {
      return [fallbackTrack];
    }
    return tracks.slice(0, 2);
  }, [entry.tracks, fallbackTrack]);

  const paddedSubscriptionTracks = useMemo(() => {
    const rows: Array<UsageTrack | null> = [...subscriptionTracks];
    while (rows.length < 2) {
      rows.push(null);
    }
    return rows;
  }, [subscriptionTracks]);

  const primaryTrack = subscriptionTracks[0] ?? fallbackTrack;
  const apiTrack = useMemo(
    () => entry.tracks.find((track) => track.kind === "api"),
    [entry.tracks],
  );
  const quotaRatio =
    primaryTrack.limit > 0 ? primaryTrack.used / primaryTrack.limit : 0;
  const quotaPct = Math.min(100, Math.round(quotaRatio * 100));

  const isNotConfigured = entry.usage.status === "not_configured";

  const costLabel = useMemo(() => {
    if (entry.cost_view.mode === "included") {
      return "Included";
    }
    if (entry.cost_view.mode !== "metered" || entry.cost_view.total == null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: entry.cost_view.currency || "USD",
      minimumFractionDigits: 2,
    }).format(entry.cost_view.total);
  }, [entry.cost_view.currency, entry.cost_view.mode, entry.cost_view.total]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="flex h-full min-h-[430px] flex-col overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:shadow-[var(--shadow-hard)]">
        <div className="pointer-events-none h-1 bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-3)]" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-[var(--surface-1)] p-2">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="max-w-[13rem] truncate text-base font-semibold tracking-tight">{entry.info.name}</CardTitle>
                <CardDescription className="uppercase tracking-[0.08em]">{entry.info.id}</CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Provider menu">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onOpenSettings(entry.info.id)}>
                  Provider Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetup(entry.info.id)}>
                  Setup Credential
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{entry.info.plan_name}</Badge>
            <Badge variant="outline" className="uppercase">
              {entry.info.auth_method}
            </Badge>
            <Badge variant="outline" className={entry.health.reachable ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-rose-500/30 text-rose-600 dark:text-rose-400"}>
              {entry.health.reachable ? "Live" : "Offline"}
            </Badge>
            {entry.stale ? (
              <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
                Stale
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4">
          {isNotConfigured ? (
            <div className="flex h-full flex-col gap-3">
              <div className="rounded-xl border border-dashed border-border bg-[var(--surface-1)] p-3">
                <p className="mb-2 text-sm text-muted-foreground">Not Configured</p>
                <Button size="sm" onClick={() => onSetup(entry.info.id)}>
                  Setup Provider
                </Button>
              </div>
              {paddedSubscriptionTracks.map((track, index) => (
                <div key={`placeholder-${entry.info.id}-${index}`} className="rounded-xl border border-border/60 bg-[var(--surface-1)] p-3">
                  <p className="text-xs text-muted-foreground">{track?.label || "Usage window"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">No data yet</p>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {paddedSubscriptionTracks.map((track, index) => {
                  if (!track) {
                    return (
                      <div key={`empty-track-${entry.info.id}-${index}`} className="rounded-xl border border-border/60 bg-[var(--surface-1)] p-3">
                        <p className="text-xs text-muted-foreground">Additional window</p>
                        <p className="text-sm text-muted-foreground">Not available</p>
                      </div>
                    );
                  }

                  const usagePct = trackPercent(track);
                  const usageRatio = track.limit > 0 ? track.used / track.limit : 0;
                  const usageColor = getQuotaColor(usageRatio);
                  return (
                    <Tooltip key={track.id}>
                      <TooltipTrigger asChild>
                        <div className="rounded-xl border border-border/60 bg-[var(--surface-1)] p-3">
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{track.label}</span>
                            <span>{usagePct}%</span>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
                            <div
                              className="h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${usagePct}%`,
                                backgroundColor: usageColor,
                              }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-medium">{formatTrackUsage(track)}</span>
                            <span className="text-muted-foreground">
                              Reset in {getResetCountdown(track.reset_at)}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Period: {entry.usage.period_start || "-"} ~ {track.reset_at || "-"}
                        </p>
                        <p className="text-xs">Source: {track.source}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Primary window</p>
                  <p className="text-base font-semibold">
                    <AnimatedNumber value={quotaPct} />%
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Cost / month</p>
                  <p className="text-base font-semibold">{costLabel}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Primary usage</p>
                  <p className="text-base font-semibold">
                    {formatTrackUsage(primaryTrack)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Reset in</p>
                  <p className="text-base font-semibold">{getResetCountdown(primaryTrack.reset_at)}</p>
                </div>
              </div>

              {apiTrack ? (
                <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5 text-xs">
                  <p className="mb-1 text-muted-foreground">API Track</p>
                  {apiTrack.limit > 0 || apiTrack.used > 0 ? (
                    <p className="font-medium">{formatTrackUsage(apiTrack)}</p>
                  ) : (
                    <p className="font-medium text-muted-foreground">
                      {apiTrack.status === "not_configured" ? "Not configured" : "Unavailable"}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5 text-xs">
                  <p className="mb-1 text-muted-foreground">API Track</p>
                  <p className="font-medium text-muted-foreground">Unavailable</p>
                </div>
              )}

              <div className="mt-auto rounded-xl border border-border/70 bg-[var(--surface-1)] p-2.5 text-xs">
                <p className="text-muted-foreground">Last checked</p>
                <p className="font-medium">{new Date(entry.health.last_checked).toLocaleString()}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
