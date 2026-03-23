import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AppConfig, AuthSourceMode, ProviderConnectionState } from "@/hooks/useProvider";
import { useProvider } from "@/hooks/useProvider";

interface ProviderSettingsProps {
  open: boolean;
  providerId: string | null;
  onClose: () => void;
}

export const ProviderSettings = ({
  open,
  providerId,
  onClose,
}: ProviderSettingsProps) => {
  const { t } = useTranslation();
  const providerApi = useProvider();
  const [interval, setInterval] = useState(300);
  const [mode, setMode] = useState<AuthSourceMode>("auto");
  const [initialMode, setInitialMode] = useState<AuthSourceMode>("auto");
  const [supportedModes, setSupportedModes] = useState<AuthSourceMode[]>(["auto"]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [connection, setConnection] = useState<ProviderConnectionState | null>(null);

  useEffect(() => {
    if (!open || !providerId) return;
    let disposed = false;

    void Promise.all([
      providerApi.getConfig(),
      providerApi.getProviderInfo(providerId),
      providerApi.getProviderAuthModes(),
    ]).then(([config, info, modeMap]) => {
      if (disposed) return;
      setConfig(config);
      const current = config.polling_intervals[providerId];
      if (typeof current === "number") {
        setInterval(current);
      }
      setSupportedModes(info.supported_auth_modes?.length ? info.supported_auth_modes : ["auto"]);
      const activeMode = modeMap[providerId] ?? info.default_auth_mode;
      setMode(activeMode);
      setInitialMode(activeMode);
      setConnection(config.provider_connections[providerId] ?? null);
    });
    return () => {
      disposed = true;
    };
  }, [open, providerApi, providerId]);

  const save = async () => {
    if (!providerId) return;
    await providerApi.setProviderAuthMode(providerId, mode);
    const latest = await providerApi.getConfig();
    latest.polling_intervals[providerId] = interval;
    const updated = await providerApi.updateConfig(latest);
    setConfig(updated);
    setConnection(updated.provider_connections[providerId] ?? null);
    onClose();
  };

  const modeChanged = mode !== initialMode;

  const toggleAutoRefresh = async () => {
    if (!providerId || !config || !connection?.verified) return;
    const updated = await providerApi.updateConfig({
      ...config,
      provider_connections: {
        ...config.provider_connections,
        [providerId]: {
          ...connection,
          auto_refresh: !connection.auto_refresh,
        },
      },
    });
    setConfig(updated);
    setConnection(updated.provider_connections[providerId] ?? null);
  };

  const removeCredential = async () => {
    if (!providerId) return;
    await providerApi.deleteCredential(providerId, mode);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]">
        <DialogHeader>
          <DialogTitle>{t("provider.settings.title")}</DialogTitle>
          <DialogDescription>
            {t("provider.settings.description", {
              provider: providerId || t("provider.common.provider"),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-[var(--surface-1)] p-3">
            <p className="text-muted-foreground">{t("provider.settings.connectionStatus")}</p>
            <p className="mt-1 font-medium">
              {connection?.verified
                ? t("provider.settings.connected")
                : t("provider.settings.verificationRequired")}
            </p>
            {connection?.last_verified_at ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("provider.settings.lastVerified", { value: new Date(connection.last_verified_at).toLocaleString() })}
              </p>
            ) : null}
            {connection?.last_error ? (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{connection.last_error}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block" htmlFor="provider-auth-mode-settings">
              {t("provider.settings.authMode")}
            </label>
            <select
              id="provider-auth-mode-settings"
              className="ui-field w-full px-3 py-2"
              value={mode}
              onChange={(event) => setMode(event.currentTarget.value as AuthSourceMode)}
            >
              {supportedModes.map((supportedMode) => (
                <option key={supportedMode} value={supportedMode}>
                  {t(`provider.setup.mode.${supportedMode}`)}
                </option>
              ))}
            </select>
            {modeChanged ? (
              <p className="mt-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                {t("provider.settings.modeChangeNotice")}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block" htmlFor="polling-interval">
              {t("provider.settings.pollingIntervalSeconds")}
            </label>
            <input
              id="polling-interval"
              className="ui-field w-full px-3 py-2"
              type="number"
              min={60}
              value={interval}
              onChange={(event) => setInterval(Number(event.currentTarget.value))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-1)] p-3">
            <div>
              <p>{t("provider.settings.autoRefresh")}</p>
              <p className="text-xs text-muted-foreground">
                {connection?.verified
                  ? t("provider.settings.autoRefreshDescription")
                  : t("provider.settings.reverifyToEnable")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(connection?.auto_refresh)}
              aria-label={t("provider.settings.autoRefresh")}
              disabled={!connection?.verified}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                connection?.auto_refresh
                  ? "border-transparent bg-primary"
                  : "border-border/70 bg-[var(--surface-2)]"
              } ${!connection?.verified ? "cursor-not-allowed opacity-50" : ""}`}
              onClick={() => {
                void toggleAutoRefresh();
              }}
            >
              <span
                className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
                  connection?.auto_refresh ? "translate-x-[22px]" : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={removeCredential}>
            {t("provider.settings.removeCredential")}
          </Button>
          <Button onClick={save}>{t("provider.settings.applyChanges")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
