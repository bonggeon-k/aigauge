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
  const providerInFlightRef = useRef(false);
  const statusInFlightRef = useRef(false);
  const costInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let disposed = false;
    let providerTimer: number | null = null;
    let statusTimer: number | null = null;
    let costTimer: number | null = null;

    const scheduleProviderRefresh = (delayMs: number) => {
      providerTimer = window.setTimeout(async () => {
        if (disposed) return;
        if (providerInFlightRef.current) {
          scheduleProviderRefresh(providerIntervalMs);
          return;
        }

        providerInFlightRef.current = true;
        try {
          await onRefreshProviders();
          failCountRef.current = 0;
        } catch {
          failCountRef.current += 1;
        } finally {
          providerInFlightRef.current = false;
          if (!disposed) {
            scheduleProviderRefresh(providerIntervalMs);
          }
        }
      }, delayMs);
    };

    const scheduleStatusRefresh = (delayMs: number) => {
      statusTimer = window.setTimeout(async () => {
        if (disposed) return;
        if (failCountRef.current < 3 && !statusInFlightRef.current) {
          statusInFlightRef.current = true;
          try {
            await onRefreshStatuses();
          } finally {
            statusInFlightRef.current = false;
          }
        }
        if (!disposed) {
          scheduleStatusRefresh(statusIntervalMs);
        }
      }, delayMs);
    };

    const scheduleCostRefresh = (delayMs: number) => {
      costTimer = window.setTimeout(async () => {
        if (disposed) return;
        if (onRefreshCost && failCountRef.current < 3 && !costInFlightRef.current) {
          costInFlightRef.current = true;
          try {
            await onRefreshCost();
          } finally {
            costInFlightRef.current = false;
          }
        }
        if (!disposed) {
          scheduleCostRefresh(costIntervalMs);
        }
      }, delayMs);
    };

    scheduleProviderRefresh(providerIntervalMs);
    scheduleStatusRefresh(statusIntervalMs);
    scheduleCostRefresh(costIntervalMs);

    return () => {
      disposed = true;
      if (providerTimer != null) window.clearTimeout(providerTimer);
      if (statusTimer != null) window.clearTimeout(statusTimer);
      if (costTimer != null) window.clearTimeout(costTimer);
    };
  }, [enabled, providerIntervalMs, statusIntervalMs, costIntervalMs, onRefreshProviders, onRefreshStatuses, onRefreshCost]);
};
