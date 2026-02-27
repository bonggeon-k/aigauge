import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type AuthMethod = "api_key" | "oauth" | "token" | "none";
export type ProviderStatus = "ok" | "not_configured" | "unreachable";

export interface ProviderDescriptor {
  id: string;
  name: string;
  auth_method: AuthMethod;
}

export interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  auth_method: AuthMethod;
  plan_name: string;
  quota_limit: number;
  reset_period: string;
}

export interface UsageData {
  provider: string;
  requests: number;
  tokens: number;
  period_start: string;
  period_end: string;
  status: ProviderStatus;
}

export interface CostData {
  provider: string;
  currency: string;
  total: number;
  period_start: string;
  period_end: string;
  status: ProviderStatus;
}

export interface QuotaLimit {
  used: number;
  limit: number;
  unit: "requests" | "tokens" | "messages" | string;
  reset_at: string;
  status: ProviderStatus;
}

export interface HealthStatus {
  configured: boolean;
  reachable: boolean;
  last_checked: string;
}

export interface DashboardEntry {
  info: ProviderInfo;
  usage: UsageData;
  quota: QuotaLimit;
  cost: CostData | null;
  health: HealthStatus;
}

export interface AppConfig {
  polling_intervals: Record<string, number>;
  enabled_providers: string[];
  theme_preference: string;
  language: string;
  notifications: {
    quota_warning: boolean;
    quota_critical: boolean;
  };
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

const fallbackDashboard: DashboardEntry[] = [
  {
    info: {
      id: "codex",
      name: "OpenAI Codex",
      icon: "bot",
      auth_method: "api_key",
      plan_name: "Usage-based",
      quota_limit: 1_000_000,
      reset_period: "monthly",
    },
    usage: {
      provider: "codex",
      requests: 128,
      tokens: 48200,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    quota: {
      used: 48200,
      limit: 1_000_000,
      unit: "tokens",
      reset_at: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    cost: {
      provider: "codex",
      currency: "USD",
      total: 42.15,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    health: {
      configured: true,
      reachable: true,
      last_checked: "2026-02-27T12:00:00Z",
    },
  },
  {
    info: {
      id: "claude",
      name: "Anthropic Claude",
      icon: "brain",
      auth_method: "api_key",
      plan_name: "Pro / Team",
      quota_limit: 15000,
      reset_period: "monthly",
    },
    usage: {
      provider: "claude",
      requests: 96,
      tokens: 36800,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    quota: {
      used: 96,
      limit: 15000,
      unit: "messages",
      reset_at: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    cost: {
      provider: "claude",
      currency: "USD",
      total: 38.72,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    health: {
      configured: true,
      reachable: true,
      last_checked: "2026-02-27T12:00:00Z",
    },
  },
  {
    info: {
      id: "cursor",
      name: "Cursor",
      icon: "mouse-pointer-click",
      auth_method: "token",
      plan_name: "Pro",
      quota_limit: 250000,
      reset_period: "monthly",
    },
    usage: {
      provider: "cursor",
      requests: 0,
      tokens: 0,
      period_start: "",
      period_end: "",
      status: "not_configured",
    },
    quota: {
      used: 0,
      limit: 0,
      unit: "tokens",
      reset_at: "",
      status: "not_configured",
    },
    cost: null,
    health: {
      configured: false,
      reachable: false,
      last_checked: "2026-02-27T12:00:00Z",
    },
  },
];

export const useTauriEvent = <T>(
  eventName: string,
  handler: (payload: T) => void,
): void => {
  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    void listen<T>(eventName, (event) => {
      handler(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        void unlisten();
      }
    };
  }, [eventName, handler]);
};

export const useProvider = () =>
  useMemo(
    () => ({
      async getProviders(): Promise<ProviderDescriptor[]> {
        if (!isTauriRuntime) {
          return fallbackDashboard.map((entry) => ({
            id: entry.info.id,
            name: entry.info.name,
            auth_method: entry.info.auth_method,
          }));
        }
        return invoke<ProviderDescriptor[]>("get_providers");
      },

      async getUsage(provider: string): Promise<UsageData> {
        if (!isTauriRuntime) {
          return (
            fallbackDashboard.find((entry) => entry.info.id === provider)?.usage ??
            fallbackDashboard[0].usage
          );
        }
        return invoke<UsageData>("get_usage", { provider });
      },

      async getCost(provider: string): Promise<CostData | null> {
        if (!isTauriRuntime) {
          return (
            fallbackDashboard.find((entry) => entry.info.id === provider)?.cost ?? null
          );
        }
        return invoke<CostData | null>("get_cost", { provider });
      },

      async getProviderInfo(provider: string): Promise<ProviderInfo> {
        if (!isTauriRuntime) {
          return (
            fallbackDashboard.find((entry) => entry.info.id === provider)?.info ??
            fallbackDashboard[0].info
          );
        }
        return invoke<ProviderInfo>("get_provider_info", { provider });
      },

      async getQuota(provider: string): Promise<QuotaLimit> {
        if (!isTauriRuntime) {
          return (
            fallbackDashboard.find((entry) => entry.info.id === provider)?.quota ??
            fallbackDashboard[0].quota
          );
        }
        return invoke<QuotaLimit>("get_quota", { provider });
      },

      async getAllDashboardData(): Promise<DashboardEntry[]> {
        if (!isTauriRuntime) {
          return fallbackDashboard;
        }
        return invoke<DashboardEntry[]>("get_all_dashboard_data");
      },

      async checkHealth(provider: string): Promise<HealthStatus> {
        if (!isTauriRuntime) {
          return {
            configured: true,
            reachable: true,
            last_checked: new Date().toISOString(),
          };
        }
        return invoke<HealthStatus>("check_provider_health", { provider });
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

      async getConfig(): Promise<AppConfig> {
        if (!isTauriRuntime) {
          return {
            polling_intervals: {
              codex: 300,
              claude: 300,
              gemini: 300,
              kiro: 300,
              copilot: 300,
              cursor: 300,
            },
            enabled_providers: ["codex", "claude", "gemini", "kiro", "copilot", "cursor"],
            theme_preference: "system",
            language: "en",
            notifications: {
              quota_warning: true,
              quota_critical: true,
            },
          };
        }
        return invoke<AppConfig>("get_config");
      },

      async updateConfig(config: AppConfig): Promise<AppConfig> {
        if (!isTauriRuntime) {
          return config;
        }
        return invoke<AppConfig>("update_config", { config });
      },
    }),
    [],
  );
