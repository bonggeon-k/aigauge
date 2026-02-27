import { useMemo, useRef } from "react";
import type { DashboardEntry } from "@/hooks/useProvider";

interface NotifyOptions {
  enabled: boolean;
  cooldownMs?: number;
}

export const useTrayNotifications = ({ enabled, cooldownMs = 5 * 60 * 1000 }: NotifyOptions) => {
  const lastNotifiedRef = useRef<Record<string, number>>({});

  return useMemo(
    () => ({
      notifyThresholds(entries: DashboardEntry[]) {
        if (!enabled || typeof window === "undefined" || !("Notification" in window)) {
          return;
        }

        if (window.Notification.permission === "default") {
          void window.Notification.requestPermission();
          return;
        }

        if (window.Notification.permission !== "granted") {
          return;
        }

        for (const entry of entries) {
          if (entry.quota.limit <= 0) {
            continue;
          }
          const usagePct = (entry.quota.used / entry.quota.limit) * 100;
          if (usagePct < 80) {
            continue;
          }

          const now = Date.now();
          const key = `${entry.info.id}:${usagePct >= 95 ? "critical" : "warning"}`;
          const last = lastNotifiedRef.current[key] ?? 0;
          if (now - last < cooldownMs) {
            continue;
          }

          const levelLabel = usagePct >= 95 ? "Critical" : "Warning";
          new window.Notification(`AIGauge ${levelLabel}`, {
            body: `${entry.info.name} quota is at ${Math.round(usagePct)}%`,
          });
          lastNotifiedRef.current[key] = now;
        }
      },
    }),
    [enabled, cooldownMs],
  );
};
