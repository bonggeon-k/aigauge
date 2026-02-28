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
  track_kind?: "subscription" | "api" | "manual";
}

export interface ServiceStatus {
  provider_id: string;
  indicator: "none" | "minor" | "major" | "critical" | "unknown" | string;
  description: string;
}

export interface CodexCostBreakdown {
  estimated_cost_usd_30d: number;
  total_tokens_30d: number;
  input_tokens_30d: number;
  output_tokens_30d: number;
  reasoning_tokens_30d: number;
  session_files_30d: number;
  token_events_30d: number;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);
const providerAllowlist = new Set([
  "codex",
  "claude",
  "gemini",
  "kiro",
  "copilot",
  "cursor",
  "jetbrains",
]);
const MANUAL_INPUT_MAX = 1_000_000_000_000;

const assertProviderId = (provider: string): void => {
  if (!providerAllowlist.has(provider)) {
    throw new Error(`unsupported provider: ${provider}`);
  }
};

const validateManualInput = (provider: string, input: ManualProviderInput): void => {
  assertProviderId(provider);
  if (provider !== input.provider) {
    throw new Error("provider mismatch");
  }
  const values = [input.requests, input.tokens, input.used, input.limit];
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) ||
        value < 0 ||
        value > MANUAL_INPUT_MAX ||
        !Number.isInteger(value),
    )
  ) {
    throw new Error("manual input values are out of range");
  }
  if (input.cost_total != null) {
    if (!Number.isFinite(input.cost_total) || input.cost_total < 0 || input.cost_total > 1_000_000_000) {
      throw new Error("manual input cost is out of range");
    }
  }
};

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
        validateManualInput(provider, input);
        if (!isTauriRuntime) {
          return;
        }
        await invoke("save_manual_input", { provider, input });
      },

      async clearProviderData(provider: string): Promise<void> {
        assertProviderId(provider);
        if (!isTauriRuntime) {
          return;
        }
        await invoke("clear_provider_data", { provider });
      },

      async fetchCodexCostBreakdown(): Promise<CodexCostBreakdown> {
        if (!isTauriRuntime) {
          return {
            estimated_cost_usd_30d: 0,
            total_tokens_30d: 0,
            input_tokens_30d: 0,
            output_tokens_30d: 0,
            reasoning_tokens_30d: 0,
            session_files_30d: 0,
            token_events_30d: 0,
          };
        }
        return invoke<CodexCostBreakdown>("get_codex_cost_breakdown");
      },
    }),
    [],
  );
