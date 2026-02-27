import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
}: TrayConfirmDialogProps) => (
  <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
    <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{description}</p>
      <DialogFooter>
        <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
        <Button
          className="rounded-full"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Confirm
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
