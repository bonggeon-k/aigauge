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

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Input · {providerId}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            Used
            <input
              className="rounded-md border border-input bg-background px-3 py-2"
              value={used}
              onChange={(event) => setUsed(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Limit
            <input
              className="rounded-md border border-input bg-background px-3 py-2"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Cost (USD)
            <input
              className="rounded-md border border-input bg-background px-3 py-2"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
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
