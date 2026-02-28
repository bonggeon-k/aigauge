import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuotaTimelineProps {
  used: number;
  limit: number;
  periodStart?: string;
  periodEnd?: string;
}

const getPace = (usedRatio: number, elapsedRatio: number) => {
  if (usedRatio > elapsedRatio * 1.1) return "Over pace";
  if (usedRatio < elapsedRatio * 0.9) return "Under pace";
  return "On pace";
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

  return (
    <Card className="flex h-full min-h-[260px] border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Quota Timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between space-y-3 text-sm">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Time elapsed</span>
            <span>{Math.round(elapsedRatio * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60">
            <div
              className="h-2 rounded-full bg-sky-500"
              style={{ width: `${Math.round(elapsedRatio * 100)}%` }}
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
          <p className="font-medium">{getPace(usedRatio, elapsedRatio)}</p>
          <p className="text-muted-foreground">Projected: {projected.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
};
