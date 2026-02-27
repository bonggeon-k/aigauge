import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DashboardEntry } from "@/hooks/useProvider";

export interface ManualProviderInput {
  provider: string;
  requests: number;
  tokens: number;
  used: number;
  limit: number;
  unit: string;
  reset_at: string;
  cost_total?: number;
  plan_name?: string;
}

export interface ServiceStatus {
  provider_id: string;
  indicator: "none" | "minor" | "major" | "critical" | "unknown" | string;
  description: string;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

export const useTrayProviders = () =>
  useMemo(
    () => ({
      async fetchAllProviders(): Promise<DashboardEntry[]> {
        if (!isTauriRuntime) {
          return [];
        }
        return invoke<DashboardEntry[]>("get_all_dashboard_data");
      },

      async fetchServiceStatuses(): Promise<ServiceStatus[]> {
        if (!isTauriRuntime) {
          return [];
        }
        return invoke<ServiceStatus[]>("get_service_statuses");
      },

      async saveManualInput(provider: string, input: ManualProviderInput): Promise<void> {
        if (!isTauriRuntime) {
          return;
        }
        await invoke("save_manual_input", { provider, input });
      },

      async clearProviderData(provider: string): Promise<void> {
        if (!isTauriRuntime) {
          return;
        }
        await invoke("clear_provider_data", { provider });
      },
    }),
    [],
  );
