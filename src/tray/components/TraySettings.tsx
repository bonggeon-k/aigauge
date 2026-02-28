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

const refreshIntervals = [1, 3, 5, 10, 15, 30] as const;

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
            <div className="mt-1 grid grid-cols-6 gap-1.5">
              {refreshIntervals.map((value) => {
                const selected = settings.refreshIntervalMinutes === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-lg border px-0 py-2 text-xs font-medium transition ${
                      selected
                        ? "border-transparent bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                        : "border-border/60 bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                    }`}
                    onClick={() => onPatchSettings({ refreshIntervalMinutes: value })}
                  >
                    {value}m
                  </button>
                );
              })}
            </div>
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
