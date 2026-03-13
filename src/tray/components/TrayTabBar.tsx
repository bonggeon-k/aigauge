import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardEntry } from "@/hooks/useProvider";

interface TrayTabBarProps {
  entries: DashboardEntry[];
  activeProvider: string;
  onSelect: (providerId: string) => void;
}

const providerThemes: Record<
  string,
  { dotClass: string; activeDotClass: string }
> = {
  codex: {
    dotClass: "bg-[#10a37f]",
    activeDotClass: "bg-[#10a37f]",
  },
  claude: {
    dotClass: "bg-[#d97706]",
    activeDotClass: "bg-[#d97706]",
  },
  gemini: {
    dotClass: "bg-[#4285f4]",
    activeDotClass: "bg-[#4285f4]",
  },
  kiro: {
    dotClass: "bg-[#ff9900]",
    activeDotClass: "bg-[#ff9900]",
  },
  copilot: {
    dotClass: "bg-[#22c55e]",
    activeDotClass: "bg-[#22c55e]",
  },
  cursor: {
    dotClass: "bg-[#38bdf8]",
    activeDotClass: "bg-[#38bdf8]",
  },
  jetbrains: {
    dotClass: "bg-[#8b5cf6]",
    activeDotClass: "bg-[#8b5cf6]",
  },
};

export const TrayTabBar = ({ entries, activeProvider, onSelect }: TrayTabBarProps) => {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const providerIds = entries.map((entry) => entry.info.id);

  const updateScrollIndicators = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const hasOverflow = maxLeft > 1;
    setCanScrollLeft(hasOverflow && node.scrollLeft > 1);
    setCanScrollRight(hasOverflow && node.scrollLeft < maxLeft - 1);
  }, []);

  const scrollByTabs = useCallback((direction: "left" | "right") => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }
    const delta = direction === "left" ? -180 : 180;
    node.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const selectAndFocus = useCallback(
    (providerId: string) => {
      onSelect(providerId);
      const button = scrollerRef.current?.querySelector<HTMLButtonElement>(
        `[data-provider-id='${providerId}']`,
      );
      button?.focus();
      button?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    },
    [onSelect],
  );

  const onTabListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (providerIds.length === 0) {
        return;
      }
      const currentIndex = Math.max(0, providerIds.indexOf(activeProvider));
      let nextIndex = currentIndex;

      switch (event.key) {
        case "ArrowLeft":
          nextIndex = currentIndex > 0 ? currentIndex - 1 : providerIds.length - 1;
          break;
        case "ArrowRight":
          nextIndex = currentIndex < providerIds.length - 1 ? currentIndex + 1 : 0;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = providerIds.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      selectAndFocus(providerIds[nextIndex]);
    },
    [activeProvider, providerIds, selectAndFocus],
  );

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) {
      return;
    }

    const onScroll = () => updateScrollIndicators();
    const rafId = window.requestAnimationFrame(onScroll);
    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(onScroll);
      resizeObserver.observe(node);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resizeObserver?.disconnect();
    };
  }, [entries.length, updateScrollIndicators]);

  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-1" data-no-drag>
      <div className="relative min-w-0">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[var(--surface-0)]/94 to-transparent transition-opacity duration-200",
            canScrollLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--surface-0)]/94 to-transparent transition-opacity duration-200",
            canScrollRight ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={scrollerRef}
          className="tray-tabs-scroll flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label={t("tray.tabBar.providers")}
          data-no-drag
          onKeyDown={onTabListKeyDown}
          onWheel={(event) => {
            const target = event.currentTarget;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
              return;
            }
            target.scrollLeft += event.deltaY;
            event.preventDefault();
          }}
        >
          {entries.map((entry) => {
            const theme = providerThemes[entry.info.id] ?? {
              dotClass: "bg-slate-400",
              activeDotClass: "bg-slate-400",
            };
            return (
            <button
              key={entry.info.id}
              type="button"
              id={`tray-tab-${entry.info.id}`}
              role="tab"
              aria-controls="tray-panel-active"
              aria-selected={activeProvider === entry.info.id}
              tabIndex={activeProvider === entry.info.id ? 0 : -1}
              onClick={() => onSelect(entry.info.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-[0.01em] transition-all duration-200",
                activeProvider === entry.info.id
                  ? "tray-tab-active border-transparent text-[var(--nav-active-fg)]"
                  : "tray-tab-idle border-border/60 bg-[var(--surface-1)] text-foreground/85 hover:bg-[var(--surface-2)] hover:text-foreground",
              )}
              data-provider-id={entry.info.id}
              data-no-drag
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  activeProvider === entry.info.id
                    ? `${theme.activeDotClass} ring-2 ring-background/80`
                    : theme.dotClass,
                )}
              />
              {entry.info.name}
            </button>
            );
          })}
        </div>
      </div>

      <div className="mt-[1px] flex h-8 items-center gap-1 rounded-full border border-border/60 bg-[var(--surface-1)] px-1">
        <button
          type="button"
          onClick={() => scrollByTabs("left")}
          className={cn(
            "rounded-full p-1 text-muted-foreground transition hover:bg-[var(--surface-1)] hover:text-foreground",
            !canScrollLeft && "cursor-not-allowed opacity-40 hover:bg-transparent",
          )}
          aria-label={t("tray.tabBar.scrollLeft")}
          disabled={!canScrollLeft}
          data-no-drag
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => scrollByTabs("right")}
          className={cn(
            "rounded-full p-1 text-muted-foreground transition hover:bg-[var(--surface-1)] hover:text-foreground",
            !canScrollRight && "cursor-not-allowed opacity-40 hover:bg-transparent",
          )}
          aria-label={t("tray.tabBar.scrollRight")}
          disabled={!canScrollRight}
          data-no-drag
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
