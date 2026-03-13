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
  language: "en" | "ko";
  onClose: () => void;
  onPatchSettings: (patch: Partial<TraySettingsType>) => void;
  onChangeLanguage: (language: "en" | "ko") => void;
}

const refreshIntervals = [1, 3, 5, 10, 15, 30] as const;

export const TraySettings = ({
  open,
  settings,
  language,
  onClose,
  onPatchSettings,
  onChangeLanguage,
}: TraySettingsProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent
        className="flex max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-[392px] flex-col overflow-hidden border-border/70 bg-[var(--glass-bg)] p-0 shadow-[var(--shadow-hard)]"
        data-no-drag
      >
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
          <DialogTitle>{t("tray.settings.title")}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
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
                      onClick={() =>
                        onPatchSettings({ refreshIntervalMinutes: value })
                      }
                    >
                      {t("tray.settings.minutesShort", { value })}
                    </button>
                  );
                })}
              </div>
            </label>

            <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
              {t("tray.settings.language")}
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(["en", "ko"] as const).map((value) => {
                  const selected = language === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        selected
                          ? "border-transparent bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                          : "border-border/60 bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                      }`}
                      onClick={() => onChangeLanguage(value)}
                    >
                      {value === "en"
                        ? t("tray.settings.languageEnglish")
                        : t("tray.settings.languageKorean")}
                    </button>
                  );
                })}
              </div>
            </label>
            <p className="rounded-xl bg-[var(--surface-1)] p-3 text-xs text-muted-foreground">
              {t("tray.settings.notificationsDesc")}
            </p>
          </div>
        </div>
        <div className="shrink-0 border-t border-border/60 px-4 py-3">
          <DialogFooter>
            <Button onClick={onClose}>{t("tray.settings.close")}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
