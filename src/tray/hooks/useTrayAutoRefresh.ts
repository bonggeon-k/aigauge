import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  enabled?: boolean;
  providerIntervalMs?: number;
  statusIntervalMs?: number;
  costIntervalMs?: number;
  onRefreshProviders: () => Promise<void>;
  onRefreshStatuses: () => Promise<void>;
  onRefreshCost?: () => Promise<void>;
}

export const useTrayAutoRefresh = ({
  enabled = true,
  providerIntervalMs = 5 * 60 * 1000,
  statusIntervalMs = 10 * 60 * 1000,
  costIntervalMs = 30 * 60 * 1000,
  onRefreshProviders,
  onRefreshStatuses,
  onRefreshCost,
}: AutoRefreshOptions) => {
  const failCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const providerTimer = window.setInterval(() => {
      void onRefreshProviders()
        .then(() => {
          failCountRef.current = 0;
        })
        .catch(() => {
          failCountRef.current += 1;
        });
    }, providerIntervalMs);

    const statusTimer = window.setInterval(() => {
      if (failCountRef.current >= 3) {
        return;
      }
      void onRefreshStatuses();
    }, statusIntervalMs);

    const costTimer = window.setInterval(() => {
      if (!onRefreshCost || failCountRef.current >= 3) {
        return;
      }
      void onRefreshCost();
    }, costIntervalMs);

    return () => {
      window.clearInterval(providerTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(costTimer);
    };
  }, [enabled, providerIntervalMs, statusIntervalMs, costIntervalMs, onRefreshProviders, onRefreshStatuses, onRefreshCost]);
};
