import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onGetStarted: () => void;
}

export const EmptyState = ({ onGetStarted }: EmptyStateProps) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/80 p-10 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("empty.description")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground korean-keep">
        {t("empty.subtleHint")}
      </p>
      <Button className="mt-4" onClick={onGetStarted} aria-label={t("empty.cta")}>
        {t("empty.cta")}
      </Button>
    </div>
  );
};
