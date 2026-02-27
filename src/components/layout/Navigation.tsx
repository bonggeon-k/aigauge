import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, Settings, TrendingUp } from "lucide-react";

export type AppRoute = "dashboard" | "analytics" | "settings";

interface NavigationProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const items: Array<{ id: AppRoute; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "settings", label: "Settings", icon: Settings },
];

export const Navigation = ({ route, onNavigate }: NavigationProps) => {
  return (
    <>
      <nav role="navigation" aria-label="Primary navigation" className="hidden w-48 shrink-0 border-r border-border/60 p-3 md:block">
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <li key={item.id} className="relative">
                {active ? (
                  <motion.span
                    layoutId="nav-active-indicator"
                    className="absolute inset-0 rounded-md bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  />
                ) : null}
                <button
                  type="button"
                  aria-label={`Navigate to ${item.label}`}
                  className={`relative z-10 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    active ? "text-primary-foreground" : "hover:bg-muted"
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

      <nav role="navigation" aria-label="Primary navigation mobile" className="fixed inset-x-4 bottom-4 z-30 rounded-xl border border-border bg-background/95 p-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`Navigate to ${item.label}`}
                className={`relative flex flex-col items-center justify-center rounded-md py-2 text-[11px] ${
                  active ? "text-primary-foreground" : "hover:bg-muted"
                }`}
                onClick={() => onNavigate(item.id)}
              >
                {active ? (
                  <motion.span
                    layoutId="nav-active-indicator-mobile"
                    className="absolute inset-0 rounded-md bg-primary"
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
