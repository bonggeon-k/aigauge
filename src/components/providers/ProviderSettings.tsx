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
import type { AuthSourceMode } from "@/hooks/useProvider";
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
  const [supportedModes, setSupportedModes] = useState<AuthSourceMode[]>(["auto"]);

  useEffect(() => {
    if (!open || !providerId) return;
    let disposed = false;

    void Promise.all([
      providerApi.getConfig(),
      providerApi.getProviderInfo(providerId),
      providerApi.getProviderAuthModes(),
    ]).then(([config, info, modeMap]) => {
      if (disposed) return;
      const current = config.polling_intervals[providerId];
      if (typeof current === "number") {
        setInterval(current);
      }
      setSupportedModes(info.supported_auth_modes?.length ? info.supported_auth_modes : ["auto"]);
      setMode(modeMap[providerId] ?? info.default_auth_mode);
    });
    return () => {
      disposed = true;
    };
  }, [open, providerApi, providerId]);

  const save = async () => {
    if (!providerId) return;
    const config = await providerApi.getConfig();
    await providerApi.setProviderAuthMode(providerId, mode);
    config.polling_intervals[providerId] = interval;
    await providerApi.updateConfig(config);
    onClose();
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
          <DialogDescription>{providerId || t("provider.common.provider")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block" htmlFor="provider-auth-mode-settings">
              {t("provider.settings.authMode")}
            </label>
            <select
              id="provider-auth-mode-settings"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={mode}
              onChange={(event) => setMode(event.currentTarget.value as AuthSourceMode)}
            >
              {supportedModes.map((supportedMode) => (
                <option key={supportedMode} value={supportedMode}>
                  {t(`provider.setup.mode.${supportedMode}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block" htmlFor="polling-interval">
              {t("provider.settings.pollingIntervalSeconds")}
            </label>
            <input
              id="polling-interval"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              type="number"
              min={60}
              value={interval}
              onChange={(event) => setInterval(Number(event.currentTarget.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={removeCredential}>
            {t("provider.settings.removeCredential")}
          </Button>
          <Button onClick={save}>{t("provider.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
