import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuotaTimelineProps {
  used: number;
  limit: number;
  periodStart?: string;
  periodEnd?: string;
}

type PaceState = {
  label: string;
  tone: string;
  hint: string;
};

const getPace = (usedRatio: number, elapsedRatio: number): PaceState => {
  if (usedRatio > elapsedRatio * 1.1) {
    return {
      label: "At risk",
      tone: "text-[var(--quota-danger)]",
      hint: "Likely to exceed quota at current pace.",
    };
  }
  if (usedRatio < elapsedRatio * 0.9) {
    return {
      label: "Below plan",
      tone: "text-[var(--quota-safe)]",
      hint: "Usage is below period progress.",
    };
  }
  return {
    label: "On track",
    tone: "text-[var(--quota-warn)]",
    hint: "Usage is aligned with period progress.",
  };
};

export const QuotaTimeline = ({
  used,
  limit,
  periodStart,
  periodEnd,
}: QuotaTimelineProps) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const start = periodStart ? new Date(periodStart).getTime() : now;
  const end = periodEnd ? new Date(periodEnd).getTime() : now;

  const elapsedRatio =
    end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;
  const usedRatio = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;

  const projected = elapsedRatio > 0 ? Math.round(used / elapsedRatio) : used;
  const projectedRatio = limit > 0 ? (projected / limit) * 100 : 0;
  const pace = getPace(usedRatio, elapsedRatio);
  const projectedText =
    limit > 0
      ? `${projected.toLocaleString()} / ${limit.toLocaleString()} (${Math.round(projectedRatio)}%)`
      : projected.toLocaleString();

  return (
    <Card className="flex h-full min-h-[260px] border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
      <CardHeader>
        <CardTitle>Quota Timeline</CardTitle>
        <p className="text-xs text-muted-foreground">
          Compares usage consumed vs time elapsed in the current billing period.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Time elapsed</span>
            <span>{Math.round(elapsedRatio * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${Math.round(elapsedRatio * 100)}%`,
                backgroundColor: "var(--chart-2)",
              }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Usage consumed</span>
            <span>{Math.round(usedRatio * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.round(usedRatio * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className={`font-medium ${pace.tone}`} title={pace.hint}>
              {pace.label}
            </p>
            <p className="text-xs text-muted-foreground">{pace.hint}</p>
          </div>
          <p className="text-right text-muted-foreground" title="Projected usage by period end if current pace continues.">
            Projected end usage: {projectedText}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
