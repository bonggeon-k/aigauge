import { AlertTriangle, ChevronDown } from "lucide-react";
import type { DashboardEntry } from "@/hooks/useProvider";
import type { CodexCostBreakdown } from "@/tray/hooks/useTrayProviders";

interface TrayProviderDetailProps {
  entry: DashboardEntry;
  status?: { indicator: string; description: string };
  codexCost?: CodexCostBreakdown | null;
  onOpenManualInput: () => void;
}

const setupGuide: Record<string, string> = {
  codex: "codex CLI 로그인 필요",
  claude: "Claude CLI 설치 및 로그인 필요",
  gemini: "Gemini CLI 설치 필요",
  kiro: "Kiro CLI 설치 필요 (WSL)",
};

interface StatusMeta {
  label: string;
  color: string;
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

const serviceStatusMeta = (indicator?: string, description?: string): StatusMeta => {
  const normalized = normalizeServiceIndicator(indicator, description);
  if (normalized === "major" || normalized === "critical" || normalized === "major_outage") {
    return {
      label: "Disrupted",
      color: "#ef4444",
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }
  if (normalized === "minor" || normalized === "degraded" || normalized === "partial_outage") {
    return {
      label: "Degraded",
      color: "#eab308",
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (normalized === "none" || normalized === "ok" || normalized === "operational") {
    return {
      label: "Operational",
      color: "#22c55e",
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: "Unknown",
    color: "#94a3b8",
    toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
  };
};

const dataStateMeta = (entry: DashboardEntry): Omit<StatusMeta, "color"> => {
  if (entry.usage.status === "not_configured") {
    return {
      label: "Not configured",
      toneClass: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
    };
  }
  if (entry.stale) {
    return {
      label: "Stale",
      toneClass: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (entry.health.reachable) {
    return {
      label: "Live",
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: "Offline",
    toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
};

const barColor = (remainingPct: number): string => {
  if (remainingPct > 50) return "var(--quota-safe)";
  if (remainingPct > 20) return "var(--quota-warn)";
  return "var(--quota-critical)";
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

const computeElapsedPercent = (periodStart: string, periodEnd: string): number => {
  const start = periodStart ? new Date(periodStart).getTime() : NaN;
  const end = periodEnd ? new Date(periodEnd).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 50;
  }
  const ratio = (Date.now() - start) / (end - start);
  return Math.max(0, Math.min(100, ratio * 100));
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

export const TrayProviderDetail = ({ entry, status, codexCost, onOpenManualInput }: TrayProviderDetailProps) => {
  const fallbackTrack = {
    id: "subscription:primary",
    kind: "subscription" as const,
    label: "Subscription quota",
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
  const serviceStatus = serviceStatusMeta(status?.indicator, status?.description);
  const dataStatus = dataStateMeta(entry);

  const usedPct = !primaryTrack || primaryTrack.limit <= 0 ? 0 : trackPercent(primaryTrack.used, primaryTrack.limit);

  const remainingPct = Math.max(0, 100 - usedPct);
  const elapsedPct = computeElapsedPercent(
    primaryTrack?.reset_at ? entry.usage.period_start : "",
    primaryTrack?.reset_at || entry.usage.period_end,
  );
  const paceLabel = usedPct > elapsedPct + 10 ? "Behind" : usedPct < elapsedPct - 10 ? "Ahead" : "On pace";

  if (entry.usage.status === "not_configured") {
    return (
      <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm shadow-[var(--shadow-soft)]">
        <p className="font-medium tracking-tight">{entry.info.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${serviceStatus.toneClass}`}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: serviceStatus.color }} />
            {serviceStatus.label}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${dataStatus.toneClass}`}>{dataStatus.label}</span>
        </div>
        <p className="mt-2 text-muted-foreground">{setupGuide[entry.info.id] ?? "Provider setup required"}</p>
        <button
          type="button"
          className="mt-4 rounded-full border border-primary/50 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/10"
          onClick={onOpenManualInput}
        >
          Manual input
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium tracking-tight">{entry.info.name}</p>
          <p className="text-xs text-muted-foreground">{entry.info.plan_name}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${serviceStatus.toneClass}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serviceStatus.color }} />
            {serviceStatus.label}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${dataStatus.toneClass}`}>
            {dataStatus.label}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Primary window remaining</span>
          <span>{remainingPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/20">
          <div
            className="h-full rounded-full"
            style={{
              width: `${remainingPct}%`,
              backgroundColor: barColor(remainingPct),
            }}
          />
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
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${remaining}%`,
                    backgroundColor: barColor(remaining),
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="font-medium">{trackUsageLabel(track.used, track.limit, track.unit)}</p>
                <p className="text-muted-foreground">Reset {computeCountdown(track.reset_at || entry.usage.period_end)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {apiTrack ? (
        <div className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs">
          <p className="mb-1 text-muted-foreground">API track</p>
          {apiTrack.limit > 0 || apiTrack.used > 0 ? (
            <p className="font-medium">
              {apiTrack.used.toLocaleString()}
              {apiTrack.limit > 0 ? ` / ${apiTrack.limit.toLocaleString()}` : ""} {apiTrack.unit}
            </p>
          ) : (
            <p className="font-medium text-muted-foreground">
              {apiTrack.status === "not_configured" ? "Not configured" : "Unavailable"}
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-[var(--surface-2)] px-3 py-2 text-xs">
        Pace: <span className={`font-medium ${paceLabel === "Behind" ? "text-rose-500" : paceLabel === "Ahead" ? "text-emerald-500" : "text-amber-500"}`}>{paceLabel}</span>
      </div>

      <details className="rounded-lg border border-border/60 bg-[var(--surface-2)] p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium">
          Cost
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        <div className="mt-2 space-y-2 text-xs">
          {entry.info.id === "codex" ? (
            <div className="space-y-1 text-muted-foreground">
              <p>
                Input: {codexCost?.input_tokens_30d.toLocaleString() ?? 0} / Output:{" "}
                {codexCost?.output_tokens_30d.toLocaleString() ?? 0} / Reasoning:{" "}
                {codexCost?.reasoning_tokens_30d.toLocaleString() ?? 0}
              </p>
              <p>
                Sessions: {codexCost?.session_files_30d ?? 0} · Events:{" "}
                {codexCost?.token_events_30d ?? 0}
              </p>
            </div>
          ) : null}
          <p>
            Monthly:{" "}
            {entry.cost_view.mode === "included"
              ? "Included"
              : `$${(
                  entry.cost_view.total ??
                  (entry.info.id === "codex"
                    ? codexCost?.estimated_cost_usd_30d
                    : undefined) ??
                  0
                ).toFixed(2)}`}
          </p>
          {entry.cost_view.mode === "included" ? (
            <p className="text-muted-foreground">No additional charge within plan quota.</p>
          ) : null}
          {entry.info.id === "codex" && codexCost ? (
            <p className="text-muted-foreground">
              API-equivalent estimate (30d): ${codexCost.estimated_cost_usd_30d.toFixed(2)}
            </p>
          ) : null}
          {((entry.cost_view.total ??
            (entry.info.id === "codex"
              ? codexCost?.estimated_cost_usd_30d
              : undefined) ??
            0) > 500) ? (
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
