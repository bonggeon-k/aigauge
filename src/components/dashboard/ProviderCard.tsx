import { useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
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
  const spring = useSpring(0, { stiffness: 120, damping: 20 });
  const display = useTransform(spring, (latest) => Math.round(latest));

  spring.set(value);
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

  const quotaRatio =
    entry.quota.limit > 0 ? entry.quota.used / entry.quota.limit : 0;
  const quotaPct = Math.min(100, Math.round(quotaRatio * 100));
  const quotaColor = getQuotaColor(quotaRatio);

  const isNotConfigured = entry.usage.status === "not_configured";

  const costLabel = useMemo(() => {
    if (!entry.cost || entry.cost.status !== "ok") {
      return "-";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: entry.cost.currency || "USD",
      minimumFractionDigits: 2,
    }).format(entry.cost.total);
  }, [entry.cost]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card className="h-full border-border/70 bg-card/90 shadow-md transition-shadow duration-200 hover:shadow-xl backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{entry.info.name}</CardTitle>
                <CardDescription>{entry.info.id}</CardDescription>
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
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isNotConfigured ? (
            <div className="rounded-lg border border-dashed border-border p-3">
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
                      <span>Quota</span>
                      <span>{quotaPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/60">
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
                <div>
                  <p className="text-muted-foreground">Requests</p>
                  <p className="font-semibold">
                    <AnimatedNumber value={entry.usage.requests} />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tokens</p>
                  <p className="font-semibold">
                    {numberFormat.format(entry.usage.tokens)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cost / month</p>
                  <p className="font-semibold">{costLabel}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Reset in</p>
                  <p className="font-semibold">{getResetCountdown(entry.quota.reset_at)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
