import type { ReactNode } from "react";
import { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, Minus, Moon, Square, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigation, type AppRoute } from "@/components/layout/Navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  updateBanner?: ReactNode;
  children: ReactNode;
}

const detectPlatform = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("windows")) {
    return "Windows";
  }
  if (userAgent.includes("mac")) {
    return "macOS";
  }
  if (userAgent.includes("linux")) {
    return "Linux";
  }
  return "Desktop";
};

const appVersion = "1.0.0";

export const AppShell = ({
  theme,
  onToggleTheme,
  route,
  onNavigate,
  updateBanner,
  children,
}: AppShellProps) => {
  const platform = detectPlatform();
  const isTauri =
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

  const isWindows = useMemo(() => platform === "Windows", [platform]);

  return (
    <div className="min-h-screen p-4 pb-24 text-foreground md:p-8 md:pb-8">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="mx-auto w-full max-w-7xl rounded-2xl border border-border/60 bg-[var(--glass-bg)] shadow-md backdrop-blur-sm">
        <header className="flex items-center justify-between rounded-t-2xl border-b border-border/70 px-4 py-3" data-tauri-drag-region={isTauri ? "" : undefined}>
          <div className="flex items-center gap-2" data-tauri-drag-region={isTauri ? "" : undefined}>
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
            <p className="text-sm font-medium">AIGauge</p>
            <p className="text-xs text-muted-foreground">{platform}</p>
          </div>
          <div className="flex items-center gap-2" data-tauri-drag-region={isTauri ? "" : undefined}>
            <Button size="icon" variant="ghost" onClick={onToggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="Menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onNavigate("dashboard")}>Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("analytics")}>Analytics</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigate("settings")}>Settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isTauri && isWindows ? (
              <div className="ml-2 flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="Minimize window" onClick={() => void getCurrentWindow().minimize()}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Maximize window" onClick={() => void getCurrentWindow().toggleMaximize()}>
                  <Square className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Close window" onClick={() => void getCurrentWindow().close()}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        {updateBanner ? <div className="border-b border-border/60 p-3">{updateBanner}</div> : null}

        <div className="flex min-h-[70vh]">
          <Navigation route={route} onNavigate={onNavigate} />
          <main id="main-content" role="main" className="w-full p-4 md:p-6">{children}</main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
          <p>Ctrl+Shift+G: Toggle window · Ctrl+Shift+R: Refresh providers</p>
          <p>v{appVersion}</p>
        </footer>
      </div>
    </div>
  );
};
