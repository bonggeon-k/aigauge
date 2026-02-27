import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const providerApi = useProvider();
  const [interval, setInterval] = useState(300);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    if (!open || !providerId) return;

    void providerApi.getConfig().then((config) => {
      const current = config.polling_intervals[providerId];
      if (typeof current === "number") {
        setInterval(current);
      }
      setNotifications(config.notifications.quota_warning);
    });
  }, [open, providerApi, providerId]);

  const save = async () => {
    if (!providerId) return;
    const config = await providerApi.getConfig();
    config.polling_intervals[providerId] = interval;
    config.notifications.quota_warning = notifications;
    await providerApi.updateConfig(config);
    onClose();
  };

  const removeCredential = async () => {
    if (!providerId) return;
    await providerApi.deleteCredential(providerId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provider Settings</DialogTitle>
          <DialogDescription>{providerId || "provider"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block" htmlFor="polling-interval">
              Polling interval (seconds)
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

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) => setNotifications(event.currentTarget.checked)}
            />
            <span>Enable notifications</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={removeCredential}>
            Remove Credential
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
