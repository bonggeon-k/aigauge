import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Window, getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Moon,
  Pin,
  PinOff,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { TrayTabBar } from "@/tray/components/TrayTabBar";
import { TrayProviderDetail } from "@/tray/components/TrayProviderDetail";
import { TrayManualInput } from "@/tray/components/TrayManualInput";
import { TraySettings } from "@/tray/components/TraySettings";
import { TrayConfirmDialog } from "@/tray/components/TrayConfirmDialog";
import { useTrayProviders } from "@/tray/hooks/useTrayProviders";
import { useTraySettings } from "@/tray/hooks/useTraySettings";
import { useTrayAutoRefresh } from "@/tray/hooks/useTrayAutoRefresh";
import { useTrayNotifications } from "@/tray/hooks/useTrayNotifications";
import { useTauriEvent, type DashboardEntry } from "@/hooks/useProvider";
import { useTheme } from "@/hooks/useTheme";
import { applyPlatformDataAttribute, detectPlatform } from "@/lib/platform";
import type { CodexCostBreakdown } from "@/tray/hooks/useTrayProviders";

const isInteractiveElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest("button, input, select, textarea, a, summary, label, [data-no-drag]"));
};

export const TrayApp = () => {
  const { t } = useTranslation();
  const providerApi = useTrayProviders();
  const { settings, patchSettings } = useTraySettings();
  const notify = useTrayNotifications({ enabled: settings.notifications });
  const { theme, toggleTheme } = useTheme();

  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("codex");
  const [statuses, setStatuses] = useState<Record<string, { indicator: string; description: string }>>({});
  const [codexCost, setCodexCost] = useState<CodexCostBreakdown | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const statusCacheAt = useRef(0);

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.info.id === activeProviderId) ?? entries[0],
    [entries, activeProviderId],
  );
  const configuredCount = useMemo(
    () => entries.filter((entry) => entry.health.configured).length,
    [entries],
  );
  const warningCount = useMemo(
    () =>
      entries.filter((entry) => {
        const track = entry.tracks.find((item) => item.kind === "subscription");
        if (track && track.limit > 0) {
          return track.used / track.limit >= 0.8;
        }
        if (entry.quota.limit > 0) {
          return entry.quota.used / entry.quota.limit >= 0.8;
        }
        return false;
      }).length,
    [entries],
  );

  const refreshProviders = useCallback(async () => {
    const [data, codexBreakdown] = await Promise.all([
      providerApi.fetchAllProviders(),
      providerApi.fetchCodexCostBreakdown(),
    ]);
    setEntries(data);
    setCodexCost(codexBreakdown);
    if (data.length > 0 && !data.some((entry) => entry.info.id === activeProviderId)) {
      setActiveProviderId(data[0].info.id);
    }
    notify.notifyThresholds(data);
  }, [providerApi, notify, activeProviderId]);

  const refreshStatuses = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - statusCacheAt.current < 5 * 60 * 1000) {
      return;
    }
    const serviceStatuses = await providerApi.fetchServiceStatuses();
    const mapped = serviceStatuses.reduce<Record<string, { indicator: string; description: string }>>(
      (acc, status) => {
        acc[status.provider_id] = {
          indicator: status.indicator,
          description: status.description,
        };
        return acc;
      },
      {},
    );
    statusCacheAt.current = now;
    setStatuses(mapped);
  }, [providerApi]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void refreshProviders()
        .then(() => {
          setLastRefreshedAt(Date.now());
          setActionNotice(null);
        })
        .catch(() => {
          setActionNotice(t("tray.status.initialRefreshFailed"));
        });
      void refreshStatuses(true);
    }, 0);
    return () => {
      window.clearTimeout(initTimer);
    };
  }, [refreshProviders, refreshStatuses, t]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    void currentWindow.setAlwaysOnTop(settings.pinned);
  }, [settings.pinned]);

  useEffect(() => {
    applyPlatformDataAttribute(detectPlatform());
  }, []);

  useTrayAutoRefresh({
    enabled: true,
    providerIntervalMs: settings.refreshIntervalMinutes * 60 * 1000,
    onRefreshProviders: refreshProviders,
    onRefreshStatuses: refreshStatuses,
  });

  useTauriEvent<boolean>("tray-refresh", () => {
    void refreshProviders();
    void refreshStatuses(true);
  });

  const refreshNow = useCallback(async () => {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    setActionNotice(null);
    try {
      await Promise.all([refreshProviders(), refreshStatuses(true)]);
      setLastRefreshedAt(Date.now());
    } catch {
      setActionNotice(t("tray.status.refreshFailed"));
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshProviders, refreshStatuses, t]);

  const startWindowDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }
    void getCurrentWindow().startDragging();
  };

  const openMainDashboard = useCallback(async () => {
    setActionNotice(null);
    const main = await Window.getByLabel("main");
    if (!main) {
      await emit("open-dashboard", true).catch(() => undefined);
      setActionNotice(t("tray.status.mainNotFound"));
      return;
    }
    try {
      await main.show();
      await main.unminimize().catch(() => undefined);
      await emit("open-dashboard", true).catch(() => undefined);
      await main.setFocus();
      await getCurrentWindow().hide().catch(() => undefined);
    } catch {
      setActionNotice(t("tray.status.unableToOpenDashboard"));
    }
  }, [t]);

  const closeQuickView = useCallback(async () => {
    await getCurrentWindow().hide().catch(() => undefined);
  }, []);

  const refreshedLabel = useMemo(() => {
    if (isRefreshing) {
      return t("tray.status.refreshing");
    }
    if (!lastRefreshedAt) {
      return t("tray.status.notRefreshedYet");
    }
    const seconds = Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000));
    if (seconds < 60) {
      return t("tray.status.updatedSecondsAgo", { count: seconds });
    }
    const minutes = Math.round(seconds / 60);
    return t("tray.status.updatedMinutesAgo", { count: minutes });
  }, [isRefreshing, lastRefreshedAt, t]);

  return (
    <div
      className="mx-auto flex h-[540px] w-[420px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-[var(--glass-bg)] p-3 text-foreground shadow-[var(--shadow-hard)] backdrop-blur"
      onMouseDown={startWindowDrag}
    >
      <div
        className="mb-3 flex items-center justify-between rounded-xl bg-[var(--surface-1)] px-2 py-1.5"
        onMouseDown={startWindowDrag}
      >
        <div>
          <p className="text-sm font-semibold tracking-tight">{t("tray.title")}</p>
          <p className="text-[11px] text-muted-foreground">{actionNotice ?? refreshedLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={() => void openMainDashboard()}
            aria-label={t("tray.actions.openDashboard")}
            title={t("tray.actions.openDashboard")}
            data-no-drag
          >
            <LayoutDashboard className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={() => void refreshNow()}
            aria-label={t("tray.actions.refresh")}
            title={t("tray.actions.refresh")}
            data-no-drag
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className={`rounded-full p-1.5 transition hover:bg-[var(--surface-2)] ${settings.pinned ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => patchSettings({ pinned: !settings.pinned })}
            aria-label={settings.pinned ? t("tray.actions.pinOff") : t("tray.actions.pinOn")}
            title={settings.pinned ? t("tray.actions.pinOff") : t("tray.actions.pinOn")}
            data-no-drag
          >
            {settings.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={toggleTheme}
            aria-label={t("tray.actions.toggleTheme")}
            title={
              theme === "dark"
                ? t("tray.actions.toggleThemeToLight")
                : t("tray.actions.toggleThemeToDark")
            }
            data-no-drag
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={() => setManualOpen(true)}
            aria-label={t("tray.actions.manualInput")}
            title={t("tray.actions.manualInput")}
            data-no-drag
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("tray.actions.settings")}
            title={t("tray.actions.settings")}
            data-no-drag
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 transition hover:bg-[var(--surface-2)]"
            onClick={() => void closeQuickView()}
            aria-label={t("tray.actions.close")}
            title={t("tray.actions.close")}
            data-no-drag
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <TrayTabBar
        entries={entries}
        activeProvider={activeProviderId}
        onSelect={setActiveProviderId}
      />

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]" data-no-drag>
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-2 py-1.5 text-muted-foreground">
          <span className="block uppercase tracking-[0.08em]">{t("tray.summary.providers")}</span>
          <span className="text-sm font-semibold text-foreground">{entries.length}</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-2 py-1.5 text-muted-foreground">
          <span className="block uppercase tracking-[0.08em]">{t("tray.summary.configured")}</span>
          <span className="text-sm font-semibold text-foreground">{configuredCount}</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-[var(--surface-1)] px-2 py-1.5 text-muted-foreground">
          <span className="block uppercase tracking-[0.08em]">{t("tray.summary.warnings")}</span>
          <span className={`text-sm font-semibold ${warningCount > 0 ? "text-[var(--quota-danger)]" : "text-foreground"}`}>
            {warningCount}
          </span>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1" data-no-drag>
        {activeEntry ? (
          <TrayProviderDetail
            entry={activeEntry}
            status={statuses[activeEntry.info.id]}
            codexCost={activeEntry.info.id === "codex" ? codexCost : null}
            onOpenManualInput={() => setManualOpen(true)}
          />
        ) : (
          <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm text-muted-foreground">
            {t("tray.emptyNoData")}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="w-full rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs transition hover:bg-[var(--surface-2)]"
            onClick={() => void openMainDashboard()}
            title={t("tray.actions.openDashboard")}
          >
            {t("tray.buttons.openDashboard")}
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs transition hover:bg-[var(--surface-2)]"
            onClick={() => setConfirmOpen(true)}
          >
            {t("tray.buttons.clearProviderData")}
          </button>
        </div>
      </div>

      <TrayManualInput
        open={manualOpen}
        providerId={activeEntry?.info.id ?? activeProviderId}
        onClose={() => setManualOpen(false)}
        onSave={async (payload) => {
          await providerApi.saveManualInput(payload.provider, payload);
          await refreshProviders();
        }}
      />

      <TraySettings
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onPatchSettings={patchSettings}
      />

      <TrayConfirmDialog
        open={confirmOpen}
        title={t("tray.confirm.clearTitle")}
        description={t("tray.confirm.clearDescription")}
        onConfirm={() => {
          if (!activeEntry) {
            return;
          }
          void providerApi.clearProviderData(activeEntry.info.id).then(() => {
            void refreshProviders();
          });
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
};
