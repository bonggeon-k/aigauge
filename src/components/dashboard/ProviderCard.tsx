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
import type { DashboardEntry } from "@/hooks/useProvider";

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

const numberFormat = new Intl.NumberFormat("en-US");

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

  const target = new Date(resetAt).getTime();
  const diffMs = target - Date.now();
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

export const ProviderCard = ({ entry, onSetup, onOpenSettings }: ProviderCardProps) => {
  const Icon = iconMap[entry.info.id as keyof typeof iconMap] ?? Bot;

  const primaryTrack = useMemo(
    () =>
      entry.tracks.find((track) => track.kind === "subscription") ?? {
        id: "subscription:primary",
        kind: "subscription" as const,
        label: "Subscription quota",
        used: entry.quota.used,
        limit: entry.quota.limit,
        unit: entry.quota.unit,
        reset_at: entry.quota.reset_at,
        status: entry.quota.status,
        source: "snapshot" as const,
      },
    [entry.quota.limit, entry.quota.reset_at, entry.quota.status, entry.quota.unit, entry.quota.used, entry.tracks],
  );
  const apiTrack = useMemo(
    () => entry.tracks.find((track) => track.kind === "api"),
    [entry.tracks],
  );
  const quotaRatio =
    primaryTrack.limit > 0 ? primaryTrack.used / primaryTrack.limit : 0;
  const quotaPct = Math.min(100, Math.round(quotaRatio * 100));
  const quotaColor = getQuotaColor(quotaRatio);

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
    >
      <Card className="h-full overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:shadow-[var(--shadow-hard)]">
        <div className="pointer-events-none h-1 bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-3)]" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-[var(--surface-1)] p-2">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">{entry.info.name}</CardTitle>
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

        <CardContent className="space-y-4">
          {isNotConfigured ? (
            <div className="rounded-xl border border-dashed border-border bg-[var(--surface-1)] p-3">
              <p className="mb-2 text-sm text-muted-foreground">Not Configured</p>
              <Button size="sm" onClick={() => onSetup(entry.info.id)}>
                Setup Provider
              </Button>
            </div>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{primaryTrack.label}</span>
                      <span>{quotaPct}%</span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${quotaPct}%`,
                          backgroundColor: quotaColor,
                        }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Period: {entry.usage.period_start || "-"} ~{" "}
                    {entry.usage.period_end || "-"}
                  </p>
                </TooltipContent>
              </Tooltip>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-base font-semibold">
                    <AnimatedNumber value={entry.usage.requests} />
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="text-base font-semibold">
                    {numberFormat.format(entry.usage.tokens)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-1)] p-2.5">
                  <p className="text-xs text-muted-foreground">Cost / month</p>
                  <p className="text-base font-semibold">{costLabel}</p>
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
                    <p className="font-medium">
                      {apiTrack.used.toLocaleString()}
                      {apiTrack.limit > 0 ? ` / ${apiTrack.limit.toLocaleString()}` : ""}
                      {" "}
                      {apiTrack.unit}
                    </p>
                  ) : (
                    <p className="font-medium text-muted-foreground">
                      {apiTrack.status === "not_configured" ? "Not configured" : "Unavailable"}
                    </p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
