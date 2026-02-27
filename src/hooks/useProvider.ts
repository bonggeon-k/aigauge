import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export type AuthMethod = "api_key" | "oauth" | "token" | "none";

export interface ProviderDescriptor {
  id: string;
  name: string;
  auth_method: AuthMethod;
}

export interface UsageData {
  provider: string;
  requests: number;
  tokens: number;
  period_start: string;
  period_end: string;
}

export interface CostData {
  provider: string;
  currency: string;
  total: number;
  period_start: string;
  period_end: string;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

const fallbackProviders: ProviderDescriptor[] = [
  { id: "codex", name: "codex", auth_method: "api_key" },
  { id: "claude", name: "claude", auth_method: "api_key" },
  { id: "gemini", name: "gemini", auth_method: "api_key" },
  { id: "kiro", name: "kiro", auth_method: "token" },
  { id: "copilot", name: "copilot", auth_method: "oauth" },
  { id: "cursor", name: "cursor", auth_method: "token" },
];

const fallbackUsage: Record<string, UsageData> = {
  codex: {
    provider: "codex",
    requests: 128,
    tokens: 48200,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
  claude: {
    provider: "claude",
    requests: 96,
    tokens: 36800,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
  gemini: {
    provider: "gemini",
    requests: 82,
    tokens: 29500,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
  kiro: {
    provider: "kiro",
    requests: 61,
    tokens: 21400,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
  copilot: {
    provider: "copilot",
    requests: 73,
    tokens: 25900,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
  cursor: {
    provider: "cursor",
    requests: 54,
    tokens: 18600,
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-02-27T23:59:59Z",
  },
};

export const useProvider = () =>
  useMemo(
    () => ({
      async getProviders(): Promise<ProviderDescriptor[]> {
        if (!isTauriRuntime) {
          return fallbackProviders;
        }
        return invoke<ProviderDescriptor[]>("get_providers");
      },

      async getUsage(provider: string): Promise<UsageData> {
        if (!isTauriRuntime) {
          return fallbackUsage[provider] ?? fallbackUsage.codex;
        }
        return invoke<UsageData>("get_usage", { provider });
      },

      async getCost(provider: string): Promise<CostData | null> {
        if (!isTauriRuntime) {
          return null;
        }
        return invoke<CostData | null>("get_cost", { provider });
      },

      async saveCredential(provider: string, credential: string): Promise<void> {
        if (!isTauriRuntime) {
          return;
        }
        await invoke("save_credential", { provider, credential });
      },

      async deleteCredential(provider: string): Promise<void> {
        if (!isTauriRuntime) {
          return;
        }
        await invoke("delete_credential", { provider });
      },
    }),
    [],
  );
