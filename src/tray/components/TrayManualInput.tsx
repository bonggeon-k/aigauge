import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ManualProviderInput } from "@/tray/hooks/useTrayProviders";

interface TrayManualInputProps {
  open: boolean;
  providerId: string;
  onClose: () => void;
  onSave: (payload: ManualProviderInput) => Promise<void>;
}

export const TrayManualInput = ({ open, providerId, onClose, onSave }: TrayManualInputProps) => {
  const [used, setUsed] = useState("0");
  const [limit, setLimit] = useState("100");
  const [cost, setCost] = useState("0");
  const [trackKind, setTrackKind] = useState<"subscription" | "api" | "manual">("subscription");

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]">
        <DialogHeader>
          <DialogTitle>Manual Input · {providerId}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            Track
            <select
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={trackKind}
              onChange={(event) => setTrackKind(event.target.value as "subscription" | "api" | "manual")}
            >
              <option value="subscription">Subscription</option>
              <option value="api">API</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            Used
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={used}
              onChange={(event) => setUsed(event.target.value)}
            />
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            Limit
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            Cost (USD)
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button
            className="rounded-full"
            onClick={async () => {
              const usedValue = Number(used) || 0;
              const limitValue = Number(limit) || 0;
              await onSave({
                provider: providerId,
                requests: usedValue,
                tokens: usedValue,
                used: usedValue,
                limit: limitValue,
                unit: "percent",
                reset_at: "manual",
                cost_total: Number(cost) || 0,
                plan_name: "Manual",
                track_kind: trackKind,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
