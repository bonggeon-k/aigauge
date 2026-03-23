import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DashboardEntry } from "@/hooks/useProvider";

interface NotifyOptions {
  warningEnabled: boolean;
  criticalEnabled: boolean;
  cooldownMs?: number;
}

export const useTrayNotifications = ({
  warningEnabled,
  criticalEnabled,
  cooldownMs = 5 * 60 * 1000,
}: NotifyOptions) => {
  const { t } = useTranslation();
  const lastNotifiedRef = useRef<Record<string, number>>({});

  return useMemo(
    () => ({
      notifyThresholds(entries: DashboardEntry[]) {
        const notificationsEnabled = warningEnabled || criticalEnabled;
        if (!notificationsEnabled || typeof window === "undefined" || !("Notification" in window)) {
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
          const tracks = entry.tracks.length > 0
            ? entry.tracks
            : [{
                id: "subscription:primary",
                kind: "subscription",
                used: entry.quota.used,
                limit: entry.quota.limit,
              }];

          for (const track of tracks) {
            if (track.limit <= 0) {
              continue;
            }

            const usagePct = (track.used / track.limit) * 100;
            if (usagePct < 80) {
              continue;
            }
            const isCritical = usagePct >= 95;
            if ((isCritical && !criticalEnabled) || (!isCritical && !warningEnabled)) {
              continue;
            }

            const now = Date.now();
            const key = `${entry.info.id}:${track.id}:${isCritical ? "critical" : "warning"}`;
            const last = lastNotifiedRef.current[key] ?? 0;
            if (now - last < cooldownMs) {
              continue;
            }

            const levelKey = isCritical ? "app.alerts.quotaCritical" : "app.alerts.quotaWarning";
            const trackLabel = t(`app.trackKind.${track.kind}`);
            new window.Notification(t("app.notifications.title"), {
              body: `${t(levelKey, { provider: entry.info.name })} (${trackLabel} ${Math.round(usagePct)}%)`,
            });
            lastNotifiedRef.current[key] = now;
          }
        }
      },
    }),
    [warningEnabled, criticalEnabled, cooldownMs, t],
  );
};
