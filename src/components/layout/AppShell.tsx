import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigation, type AppRoute } from "@/components/layout/Navigation";
import {
  applyPlatformDataAttribute,
  detectPlatform,
  shortcutPrimaryModifier,
} from "@/lib/platform";
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

  const shortcutPrefix = useMemo(() => shortcutPrimaryModifier(platform), [platform]);

  useEffect(() => {
    applyPlatformDataAttribute(platform);
  }, [platform]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    void getCurrentWindow()
      .setTheme(theme === "dark" ? "dark" : "light")
      .catch(() => undefined);
  }, [isTauri, theme]);

  return (
    <div className="relative min-h-screen overflow-hidden p-4 pb-24 text-foreground md:p-8 md:pb-8">
      <div className="pointer-events-none absolute inset-0 anim-aurora">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-300/10" />
        <div className="absolute right-[-5rem] top-28 h-72 w-72 rounded-full bg-orange-400/20 blur-3xl dark:bg-orange-300/10" />
      </div>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="premium-shell anim-rise relative mx-auto w-full max-w-7xl overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between rounded-t-2xl border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2" data-tauri-drag-region={isTauri ? "" : undefined}>
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]" />
            <p className="text-sm font-semibold tracking-tight">AIGauge</p>
            <p className="rounded-full bg-[var(--nav-muted)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{platform}</p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </header>

        {updateBanner ? <div className="border-b border-border/60 p-3">{updateBanner}</div> : null}

        <div className="flex min-h-[70vh]">
          <Navigation route={route} onNavigate={onNavigate} />
          <main id="main-content" role="main" className="w-full p-4 md:p-6">{children}</main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
          <p>{shortcutPrefix}+Shift+G: Toggle window · {shortcutPrefix}+Shift+R: Refresh providers</p>
          <p>v{appVersion}</p>
        </footer>
      </div>
    </div>
  );
};
