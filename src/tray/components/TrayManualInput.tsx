import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Gauge, PenSquare } from "lucide-react";
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
  const { t } = useTranslation();
  const [used, setUsed] = useState("0");
  const [limit, setLimit] = useState("100");
  const [cost, setCost] = useState("0");
  const [trackKind, setTrackKind] = useState<"subscription" | "api" | "manual">("subscription");
  const [validationError, setValidationError] = useState<string>("");

  const parseInteger = (value: string): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  };

  const parseCost = (value: string): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t("tray.manual.title", { provider: providerId })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            {t("tray.manual.track")}
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  trackKind === "subscription"
                    ? "border-transparent bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                    : "border-border/60 bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                }`}
                onClick={() => setTrackKind("subscription")}
              >
                <Gauge className="h-3.5 w-3.5" />
                {t("tray.manual.trackSubscription")}
              </button>
              <button
                type="button"
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  trackKind === "api"
                    ? "border-transparent bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                    : "border-border/60 bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                }`}
                onClick={() => setTrackKind("api")}
              >
                <Cloud className="h-3.5 w-3.5" />
                {t("tray.manual.trackApi")}
              </button>
              <button
                type="button"
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  trackKind === "manual"
                    ? "border-transparent bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.28)]"
                    : "border-border/60 bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                }`}
                onClick={() => setTrackKind("manual")}
              >
                <PenSquare className="h-3.5 w-3.5" />
                {t("tray.manual.trackManual")}
              </button>
            </div>
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            {t("tray.manual.used")}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={used}
              onChange={(event) => setUsed(event.target.value)}
            />
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            {t("tray.manual.limit")}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
          <label className="grid gap-1 rounded-xl bg-[var(--surface-1)] p-3">
            {t("tray.manual.cost")}
            <input
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>{t("tray.confirm.cancel")}</Button>
          <Button
            className="rounded-full"
            onClick={async () => {
              const usedValue = parseInteger(used);
              const limitValue = parseInteger(limit);
              const costValue = parseCost(cost);
              if (usedValue == null || limitValue == null || costValue == null) {
                setValidationError("Enter valid non-negative numbers.");
                return;
              }
              if (limitValue > 1_000_000_000_000 || usedValue > 1_000_000_000_000 || costValue > 1_000_000_000) {
                setValidationError("Values exceed allowed range.");
                return;
              }
              setValidationError("");
              await onSave({
                provider: providerId,
                requests: usedValue,
                tokens: usedValue,
                used: usedValue,
                limit: limitValue,
                unit: "percent",
                reset_at: "manual",
                cost_total: costValue,
                plan_name: "Manual",
                track_kind: trackKind,
              });
              onClose();
            }}
          >
            {t("provider.save")}
          </Button>
        </DialogFooter>
        {validationError ? (
          <p className="text-xs text-rose-500">{validationError}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
