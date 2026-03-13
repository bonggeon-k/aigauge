import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";

interface TrayViewProps {
  children: ReactNode;
}

export const TrayView = ({ children }: TrayViewProps) => {
  const { t } = useTranslation();

  return (
    <section className="w-full rounded-xl border border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="mb-3">
        <h2 className="text-sm font-medium">{t("tray.overview.title")}</h2>
        <p className="text-xs text-muted-foreground korean-keep">{t("tray.overview.subtitle")}</p>
      </div>
      <Separator className="mb-4" />
      {children}
    </section>
  );
};
