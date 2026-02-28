import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface TrayConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const TrayConfirmDialog = ({
  open,
  title,
  description,
  onConfirm,
  onClose,
}: TrayConfirmDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]" data-no-drag>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>{t("tray.confirm.cancel")}</Button>
          <Button
            className="rounded-full"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {t("tray.confirm.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
