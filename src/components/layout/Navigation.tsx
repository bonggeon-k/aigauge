import type { ComponentType } from "react";
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
      <nav className="hidden w-48 shrink-0 border-r border-border/60 p-3 md:block">
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
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

      <nav className="fixed inset-x-4 bottom-4 z-30 rounded-xl border border-border bg-background/95 p-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex flex-col items-center justify-center rounded-md py-2 text-[11px] ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon className="mb-1 h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
