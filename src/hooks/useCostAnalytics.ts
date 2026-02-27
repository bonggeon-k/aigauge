import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProviderCost {
  provider: string;
  amount: number;
  percentage_of_total: number;
}

export interface CostSummary {
  total_monthly: number;
  by_provider: ProviderCost[];
  currency: string;
}

export interface MonthlyCostHistory {
  month: string;
  total: number;
  by_provider: ProviderCost[];
}

export interface RoiEntry {
  provider: string;
  cost_per_request: number;
  cost_per_1k_tokens: number;
  efficiency_score: number;
}

export interface RoiAnalysis {
  entries: RoiEntry[];
  best_value_provider: string | null;
}

export interface PaceAnalysis {
  monthly_budget: number;
  spent_so_far: number;
  projected_monthly_total: number;
  on_track: boolean;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

const fallbackSummary: CostSummary = {
  total_monthly: 92.3,
  currency: "USD",
  by_provider: [
    { provider: "codex", amount: 42.15, percentage_of_total: 45.67 },
    { provider: "claude", amount: 38.72, percentage_of_total: 41.95 },
    { provider: "gemini", amount: 11.43, percentage_of_total: 12.38 },
  ],
};

export const useCostAnalytics = () =>
  useMemo(
    () => ({
      async getCostSummary(): Promise<CostSummary> {
        if (!isTauriRuntime) {
          return fallbackSummary;
        }
        return invoke<CostSummary>("get_cost_summary");
      },

      async getCostHistory(): Promise<MonthlyCostHistory[]> {
        if (!isTauriRuntime) {
          return [
            { month: "2025-11", total: 70.0, by_provider: [] },
            { month: "2025-12", total: 76.3, by_provider: [] },
            { month: "2026-01", total: 81.8, by_provider: [] },
            { month: "2026-02", total: 92.3, by_provider: [] },
          ];
        }
        return invoke<MonthlyCostHistory[]>("get_cost_history");
      },

      async getROIAnalysis(): Promise<RoiAnalysis> {
        if (!isTauriRuntime) {
          return {
            best_value_provider: "codex",
            entries: [
              {
                provider: "codex",
                cost_per_request: 0.11,
                cost_per_1k_tokens: 0.87,
                efficiency_score: 12.4,
              },
            ],
          };
        }
        return invoke<RoiAnalysis>("get_roi_analysis");
      },

      async getPaceAnalysis(monthlyBudget = 100): Promise<PaceAnalysis> {
        if (!isTauriRuntime) {
          return {
            monthly_budget: monthlyBudget,
            spent_so_far: 92.3,
            projected_monthly_total: 103.1,
            on_track: false,
          };
        }
        return invoke<PaceAnalysis>("get_pace_analysis", { monthlyBudget });
      },
    }),
    [],
  );
