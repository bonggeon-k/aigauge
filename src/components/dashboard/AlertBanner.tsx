import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

type AlertLevel = "warning" | "critical";

interface AlertBannerProps {
  message: string;
  level: AlertLevel;
  onDismiss: () => void;
}

export const AlertBanner = ({ message, level, onDismiss }: AlertBannerProps) => {
  const [visible, setVisible] = useState(true);

  const bgClass =
    level === "critical"
      ? "bg-red-500/10 border-red-500/40"
      : "bg-amber-500/10 border-amber-500/40";

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          className={`mb-4 rounded-lg border px-4 py-3 ${bgClass}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              {level === "critical" ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <BellRing className="h-4 w-4 text-amber-500" />
              )}
              <span>{message}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVisible(false);
                onDismiss();
              }}
            >
              Dismiss
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
