import { useMemo } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { DashboardEntry } from "@/hooks/useProvider";

interface TrayProviderDetailProps {
  entry: DashboardEntry;
  status?: { indicator: string; description: string };
  onOpenManualInput: () => void;
}

const setupGuide: Record<string, string> = {
  codex: "codex CLI 로그인 필요",
  claude: "Claude CLI 설치 및 로그인 필요",
  gemini: "Gemini CLI 설치 필요",
  kiro: "Kiro CLI 설치 필요 (WSL)",
};

const statusColor = (indicator?: string): string => {
  if (indicator === "major" || indicator === "critical") return "#ef4444";
  if (indicator === "minor" || indicator === "degraded") return "#eab308";
  return "#22c55e";
};

const barColor = (remainingPct: number): string => {
  if (remainingPct > 50) return "var(--quota-safe)";
  if (remainingPct > 20) return "var(--quota-warn)";
  return "var(--quota-critical)";
};

const computeCountdown = (resetAt: string): string => {
  if (!resetAt) return "-";

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
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return `${days}d`;
  }

  const parsed = new Date(resetAt);
  if (Number.isNaN(parsed.getTime())) return resetAt;
  const diffMs = parsed.getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `${days}d`;
};

export const TrayProviderDetail = ({ entry, status, onOpenManualInput }: TrayProviderDetailProps) => {
  const usedPct = useMemo(() => {
    if (entry.quota.limit <= 0) return 0;
    return Math.min(100, (entry.quota.used / entry.quota.limit) * 100);
  }, [entry.quota.limit, entry.quota.used]);

  const remainingPct = Math.max(0, 100 - usedPct);
  const elapsedPct = 50;
  const paceLabel = usedPct > elapsedPct + 10 ? "Behind" : usedPct < elapsedPct - 10 ? "Ahead" : "On pace";

  if (entry.usage.status === "not_configured") {
    return (
      <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm">
        <p className="font-medium">{entry.info.name}</p>
        <p className="mt-2 text-muted-foreground">{setupGuide[entry.info.id] ?? "Provider setup required"}</p>
        <button
          type="button"
          className="mt-4 rounded-md border border-primary/50 px-3 py-1.5 text-xs text-primary"
          onClick={onOpenManualInput}
        >
          Manual input
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{entry.info.name}</p>
          <p className="text-xs text-muted-foreground">{entry.info.plan_name}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(status?.indicator) }} />
          {status?.indicator ?? "none"}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Remaining</span>
          <span>{remainingPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/20">
          <div className="h-full rounded-full" style={{ width: `${remainingPct}%`, backgroundColor: barColor(remainingPct) }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Used</p>
          <p className="font-medium">{entry.quota.used.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Limit</p>
          <p className="font-medium">{entry.quota.limit.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Reset</p>
          <p className="font-medium">{computeCountdown(entry.quota.reset_at || entry.usage.period_end)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs">
        Pace: <span className="font-medium">{paceLabel}</span>
      </div>

      <details className="rounded-lg border border-border/60 bg-[var(--surface-2)] p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
          Cost
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        <div className="mt-2 space-y-2 text-xs">
          {entry.info.id === "codex" ? (
            <p className="text-muted-foreground">Input/output/reasoning breakdown shown when cost data is available.</p>
          ) : null}
          <p>Monthly: ${entry.cost?.total?.toFixed(2) ?? "0.00"}</p>
          {(entry.cost?.total ?? 0) > 500 ? (
            <div className="flex items-center gap-2 text-[var(--quota-critical)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              High cost warning
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
};
