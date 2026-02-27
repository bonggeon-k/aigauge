import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { detectPlatform, platformDataKey } from "@/lib/platform";

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

export type TrackKind = "subscription" | "api" | "manual";
export type DataSource = "oauth" | "cli" | "cache" | "manual" | "snapshot";
export type CostDisplayMode = "included" | "metered" | "unavailable";

export interface UsageTrack {
  id: string;
  kind: TrackKind;
  label: string;
  used: number;
  limit: number;
  unit: string;
  reset_at: string;
  status: ProviderStatus;
  source: DataSource;
}

export interface CostView {
  mode: CostDisplayMode;
  currency: string;
  total: number | null;
  note: string;
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
  tracks: UsageTrack[];
  preferred_track: TrackKind;
  cost_view: CostView;
  stale: boolean;
  health: HealthStatus;
}

export interface AppConfig {
  polling_intervals: Record<string, number>;
  enabled_providers: string[];
  theme_preference: string;
  language: string;
  onboarding_complete: boolean;
  telemetry_enabled: boolean;
  notifications: {
    quota_warning: boolean;
    quota_critical: boolean;
  };
}

export interface ShortcutInfo {
  id: string;
  accelerator: string;
  description: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  auth_method: AuthMethod;
  api_endpoint: string;
}

export interface TelemetryStatus {
  enabled: boolean;
  configured_provider_count: number;
  app_version: string;
  os: string;
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
  track_kind?: TrackKind;
}

export interface ServiceStatus {
  provider_id: string;
  indicator: string;
  description: string;
}

export interface CopilotDeviceFlowStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | null;
  expires_in: number;
  interval: number;
}

export interface CopilotDeviceFlowPoll {
  status: string;
  message?: string | null;
  interval?: number | null;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);
const fallbackOs = platformDataKey(detectPlatform());

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
    tracks: [
      {
        id: "subscription:weekly_limit",
        kind: "subscription",
        label: "Weekly limit",
        used: 62,
        limit: 100,
        unit: "percent",
        reset_at: "2026-02-27T23:59:59Z",
        status: "ok",
        source: "oauth",
      },
      {
        id: "api:primary",
        kind: "api",
        label: "API usage",
        used: 48200,
        limit: 1000000,
        unit: "tokens",
        reset_at: "2026-02-27T23:59:59Z",
        status: "ok",
        source: "snapshot",
      },
    ],
    preferred_track: "subscription",
    cost_view: {
      mode: "metered",
      currency: "USD",
      total: 42.15,
      note: "Usage-based charges",
    },
    stale: false,
    health: { configured: true, reachable: true, last_checked: "2026-02-27T12:00:00Z" },
  },
  {
    info: {
      id: "jetbrains",
      name: "JetBrains AI Assistant",
      icon: "brain-circuit",
      auth_method: "none",
      plan_name: "AI Pro",
      quota_limit: 150000,
      reset_period: "monthly",
    },
    usage: {
      provider: "jetbrains",
      requests: 32,
      tokens: 12600,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    quota: {
      used: 12600,
      limit: 150000,
      unit: "tokens",
      reset_at: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    cost: {
      provider: "jetbrains",
      currency: "USD",
      total: 11.43,
      period_start: "2026-02-01T00:00:00Z",
      period_end: "2026-02-27T23:59:59Z",
      status: "ok",
    },
    tracks: [
      {
        id: "subscription:primary",
        kind: "subscription",
        label: "Monthly credits",
        used: 12600,
        limit: 150000,
        unit: "credits",
        reset_at: "2026-02-27T23:59:59Z",
        status: "ok",
        source: "snapshot",
      },
    ],
    preferred_track: "subscription",
    cost_view: {
      mode: "included",
      currency: "USD",
      total: null,
      note: "No additional charge within plan quota",
    },
    stale: false,
    health: { configured: true, reachable: true, last_checked: "2026-02-27T12:00:00Z" },
  },
];

export const useTauriEvent = <T>(eventName: string, handler: (payload: T) => void): void => {
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
          return fallbackDashboard.find((entry) => entry.info.id === provider)?.usage ?? fallbackDashboard[0].usage;
        }
        return invoke<UsageData>("get_usage", { provider });
      },

      async getCost(provider: string): Promise<CostData | null> {
        if (!isTauriRuntime) {
          return fallbackDashboard.find((entry) => entry.info.id === provider)?.cost ?? null;
        }
        return invoke<CostData | null>("get_cost", { provider });
      },

      async getProviderInfo(provider: string): Promise<ProviderInfo> {
        if (!isTauriRuntime) {
          return fallbackDashboard.find((entry) => entry.info.id === provider)?.info ?? fallbackDashboard[0].info;
        }
        return invoke<ProviderInfo>("get_provider_info", { provider });
      },

      async getQuota(provider: string): Promise<QuotaLimit> {
        if (!isTauriRuntime) {
          return fallbackDashboard.find((entry) => entry.info.id === provider)?.quota ?? fallbackDashboard[0].quota;
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
          return { configured: true, reachable: true, last_checked: new Date().toISOString() };
        }
        return invoke<HealthStatus>("check_provider_health", { provider });
      },

      async saveCredential(provider: string, credential: string): Promise<void> {
        if (isTauriRuntime) {
          await invoke("save_credential", { provider, credential });
        }
      },

      async startCopilotDeviceFlow(): Promise<CopilotDeviceFlowStart> {
        if (!isTauriRuntime) {
          return {
            device_code: "dev-device-code",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            verification_uri_complete: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          };
        }
        return invoke<CopilotDeviceFlowStart>("start_copilot_device_flow");
      },

      async pollCopilotDeviceFlow(deviceCode: string): Promise<CopilotDeviceFlowPoll> {
        if (!isTauriRuntime) {
          return { status: "authorization_pending", message: "Mock pending", interval: 5 };
        }
        return invoke<CopilotDeviceFlowPoll>("poll_copilot_device_flow", { deviceCode });
      },

      async deleteCredential(provider: string): Promise<void> {
        if (isTauriRuntime) {
          await invoke("delete_credential", { provider });
        }
      },

      async saveManualInput(provider: string, input: ManualProviderInput): Promise<void> {
        if (isTauriRuntime) {
          await invoke("save_manual_input", { provider, input });
        }
      },

      async clearProviderData(provider: string): Promise<void> {
        if (isTauriRuntime) {
          await invoke("clear_provider_data", { provider });
        }
      },

      async getServiceStatuses(): Promise<ServiceStatus[]> {
        if (!isTauriRuntime) {
          return [];
        }
        return invoke<ServiceStatus[]>("get_service_statuses");
      },

      async getKeyboardShortcuts(): Promise<ShortcutInfo[]> {
        if (!isTauriRuntime) {
          return [
            {
              id: "toggle_window",
              accelerator: "Ctrl+Shift+G",
              description: "Toggle window",
            },
          ];
        }
        return invoke<ShortcutInfo[]>("get_keyboard_shortcuts");
      },

      async getPlugins(): Promise<PluginManifest[]> {
        if (!isTauriRuntime) {
          return [];
        }
        return invoke<PluginManifest[]>("get_plugins");
      },

      async registerPlugin(manifest: PluginManifest): Promise<PluginManifest> {
        if (!isTauriRuntime) {
          return manifest;
        }
        return invoke<PluginManifest>("register_plugin", { manifest });
      },

      async getTelemetryStatus(): Promise<TelemetryStatus> {
        if (!isTauriRuntime) {
          return {
            enabled: false,
            configured_provider_count: fallbackDashboard.length,
            app_version: "1.0.0",
            os: fallbackOs,
          };
        }
        return invoke<TelemetryStatus>("get_telemetry_status");
      },

      async setTelemetryEnabled(enabled: boolean): Promise<TelemetryStatus> {
        if (!isTauriRuntime) {
          return {
            enabled,
            configured_provider_count: fallbackDashboard.length,
            app_version: "1.0.0",
            os: fallbackOs,
          };
        }
        return invoke<TelemetryStatus>("set_telemetry_enabled", { enabled });
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
              jetbrains: 300,
            },
            enabled_providers: ["codex", "claude", "gemini", "kiro", "copilot", "cursor", "jetbrains"],
            theme_preference: "system",
            language: "en",
            onboarding_complete: false,
            telemetry_enabled: false,
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

      async getCodexCostBreakdown(): Promise<CodexCostBreakdown> {
        if (!isTauriRuntime) {
          return {
            estimated_cost_usd_30d: 42.15,
            total_tokens_30d: 48200,
            input_tokens_30d: 22000,
            output_tokens_30d: 21000,
            reasoning_tokens_30d: 5200,
            session_files_30d: 12,
            token_events_30d: 83,
          };
        }
        return invoke<CodexCostBreakdown>("get_codex_cost_breakdown");
      },
    }),
    [],
  );
