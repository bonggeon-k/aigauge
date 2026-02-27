import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings2, Pin, RefreshCw, SlidersHorizontal } from "lucide-react";
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

const isInteractiveElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("button, input, select, textarea, a, summary, label"));
};

export const TrayApp = () => {
  const providerApi = useTrayProviders();
  const { settings, patchSettings } = useTraySettings();
  const notify = useTrayNotifications({ enabled: settings.notifications });

  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState("codex");
  const [statuses, setStatuses] = useState<Record<string, { indicator: string; description: string }>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const statusCacheAt = useRef(0);

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.info.id === activeProviderId) ?? entries[0],
    [entries, activeProviderId],
  );

  const refreshProviders = useCallback(async () => {
    const data = await providerApi.fetchAllProviders();
    setEntries(data);
    if (data.length > 0 && !data.some((entry) => entry.info.id === activeProviderId)) {
      setActiveProviderId(data[0].info.id);
    }
    notify.notifyThresholds(data);
  }, [providerApi, notify, activeProviderId]);

  const refreshStatuses = useCallback(async () => {
    const now = Date.now();
    if (now - statusCacheAt.current < 5 * 60 * 1000) {
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
      void refreshProviders();
      void refreshStatuses();
    }, 0);
    return () => {
      window.clearTimeout(initTimer);
    };
  }, [refreshProviders, refreshStatuses]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    void currentWindow.setAlwaysOnTop(settings.pinned);
  }, [settings.pinned]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    void currentWindow.onFocusChanged(({ payload }) => {
      if (payload || settingsOpen || manualOpen || confirmOpen) {
        return;
      }
      void currentWindow.hide();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [settingsOpen, manualOpen, confirmOpen]);

  useTrayAutoRefresh({
    enabled: true,
    providerIntervalMs: settings.refreshIntervalMinutes * 60 * 1000,
    onRefreshProviders: refreshProviders,
    onRefreshStatuses: refreshStatuses,
  });

  useTauriEvent<boolean>("tray-refresh", () => {
    void refreshProviders();
    void refreshStatuses();
  });

  return (
    <div
      className="mx-auto h-[540px] w-[420px] overflow-hidden rounded-2xl border border-border/70 bg-[var(--surface-0)] p-3 text-foreground"
      onMouseDown={(event) => {
        if (event.button !== 0 || isInteractiveElement(event.target)) {
          return;
        }
        void getCurrentWindow().startDragging();
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">AIGauge Quick View</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-[var(--surface-2)]"
            onClick={() => void refreshProviders()}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-[var(--surface-2)]"
            onClick={() => patchSettings({ pinned: !settings.pinned })}
            aria-label="Toggle pin"
          >
            <Pin className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-[var(--surface-2)]"
            onClick={() => setManualOpen(true)}
            aria-label="Manual input"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-[var(--surface-2)]"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <TrayTabBar
        entries={entries}
        activeProvider={activeProviderId}
        onSelect={setActiveProviderId}
      />

      <div className="mt-3 h-[430px] overflow-y-auto pr-1">
        {activeEntry ? (
          <TrayProviderDetail
            entry={activeEntry}
            status={statuses[activeEntry.info.id]}
            onOpenManualInput={() => setManualOpen(true)}
          />
        ) : (
          <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-4 text-sm text-muted-foreground">
            No provider data yet.
          </div>
        )}

        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-xs"
          onClick={() => setConfirmOpen(true)}
        >
          Clear provider data
        </button>
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
        title="Clear data"
        description="Remove cached/manual data for the selected provider?"
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
