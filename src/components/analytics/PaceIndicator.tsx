import { AlertTriangle, CheckCircle2, Timer } from "lucide-react";
import type { PaceAnalysis } from "@/hooks/useCostAnalytics";
import { Card } from "@/components/ui/card";

interface PaceIndicatorProps {
  pace: PaceAnalysis | null;
}

export const PaceIndicator = ({ pace }: PaceIndicatorProps) => {
  if (!pace) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">No pace data yet.</p>
      </Card>
    );
  }

  const status = pace.on_track ? "On track" : "Over budget";
  const Icon = pace.on_track ? CheckCircle2 : AlertTriangle;
  const ratio = pace.monthly_budget > 0 ? pace.projected_monthly_total / pace.monthly_budget : 0;
  const width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  const daysRemaining = Math.max(0, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate());

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" />
          {status}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Timer className="h-3 w-3" />
          {daysRemaining}d remaining
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-[var(--quota-warn)]" style={{ width }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <p>Projected: ${pace.projected_monthly_total.toFixed(2)}</p>
        <p>Budget: ${pace.monthly_budget.toFixed(2)}</p>
      </div>
    </Card>
  );
};
