import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TraySettings as TraySettingsType } from "@/tray/hooks/useTraySettings";

interface TraySettingsProps {
  open: boolean;
  settings: TraySettingsType;
  onClose: () => void;
  onPatchSettings: (patch: Partial<TraySettingsType>) => void;
}

export const TraySettings = ({ open, settings, onClose, onPatchSettings }: TraySettingsProps) => (
  <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Tray Settings</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 text-sm">
        <label className="grid gap-1">
          Refresh interval (minutes)
          <input
            type="number"
            min={1}
            max={60}
            className="rounded-md border border-input bg-background px-3 py-2"
            value={settings.refreshIntervalMinutes}
            onChange={(event) =>
              onPatchSettings({ refreshIntervalMinutes: Number(event.target.value) || 5 })
            }
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={(event) => onPatchSettings({ notifications: event.target.checked })}
          />
          Notifications
        </label>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
