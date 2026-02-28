import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { TraySettings as TraySettingsType } from "@/tray/hooks/useTraySettings";

interface TraySettingsProps {
  open: boolean;
  settings: TraySettingsType;
  onClose: () => void;
  onPatchSettings: (patch: Partial<TraySettingsType>) => void;
}

export const TraySettings = ({ open, settings, onClose, onPatchSettings }: TraySettingsProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t("tray.settings.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            {t("tray.settings.refreshInterval")}
            <input
              type="number"
              min={1}
              max={60}
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={settings.refreshIntervalMinutes}
              onChange={(event) =>
                onPatchSettings({ refreshIntervalMinutes: Number(event.target.value) || 5 })
              }
            />
          </label>

          <label className="inline-flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(event) => onPatchSettings({ notifications: event.target.checked })}
            />
            {t("tray.settings.notifications")}
          </label>
          <p className="rounded-xl bg-[var(--surface-1)] p-3 text-xs text-muted-foreground">
            {t("tray.settings.notificationsDesc")}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("tray.settings.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
