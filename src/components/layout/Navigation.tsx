import type { ComponentType } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LayoutDashboard, Settings, TrendingUp } from "lucide-react";

export type AppRoute = "dashboard" | "analytics" | "settings";

interface NavigationProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

export const Navigation = ({ route, onNavigate }: NavigationProps) => {
  const { t } = useTranslation();
  const items = useMemo<Array<{ id: AppRoute; label: string; icon: ComponentType<{ className?: string }> }>>(
    () => [
      { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
      { id: "analytics", label: t("nav.analytics"), icon: TrendingUp },
      { id: "settings", label: t("nav.settings"), icon: Settings },
    ],
    [t],
  );

  return (
    <>
      <nav role="navigation" aria-label={t("nav.primary")} className="hidden w-56 shrink-0 border-r border-border/60 bg-[var(--nav-bg)] p-3 backdrop-blur-sm md:block">
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <li key={item.id} className="relative">
                {active ? (
                  <motion.span
                    layoutId="nav-active-indicator"
                    className="absolute inset-0 rounded-xl bg-[var(--nav-active)] shadow-[0_12px_24px_rgba(15,118,110,0.35)]"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  />
                ) : null}
                <button
                  type="button"
                  aria-label={t("nav.navigateTo", { item: item.label })}
                  className={`relative z-10 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    active ? "text-[var(--nav-active-fg)]" : "text-foreground/80 hover:bg-muted"
                  }`}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav role="navigation" aria-label={t("nav.primaryMobile")} className="fixed inset-x-4 bottom-4 z-30 rounded-2xl border border-border bg-[var(--nav-bg)] p-2 shadow-lg backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={t("nav.navigateTo", { item: item.label })}
                className={`relative flex flex-col items-center justify-center rounded-md py-2 text-[11px] ${
                  active ? "text-primary-foreground" : "hover:bg-muted"
                }`}
                onClick={() => onNavigate(item.id)}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active-indicator-mobile"
                    className="absolute inset-0 rounded-xl bg-[var(--nav-active)]"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  />
                ) : null}
                <Icon className="relative z-10 mb-1 h-4 w-4" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
