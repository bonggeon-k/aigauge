import { useCallback, useRef, type KeyboardEvent } from "react";
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
  { activeClass: string; dotClass: string; activeDotClass: string }
> = {
  codex: {
    activeClass: "bg-gradient-to-br from-[#10a37f] to-[#46d3ae]",
    dotClass: "bg-[#10a37f]",
    activeDotClass: "bg-white/90",
  },
  claude: {
    activeClass: "bg-gradient-to-br from-[#d97706] to-[#f0a84f]",
    dotClass: "bg-[#d97706]",
    activeDotClass: "bg-white/90",
  },
  gemini: {
    activeClass: "bg-gradient-to-br from-[#4285f4] to-[#80abff]",
    dotClass: "bg-[#4285f4]",
    activeDotClass: "bg-white/90",
  },
  kiro: {
    activeClass: "bg-gradient-to-br from-[#ff9900] to-[#ffc266]",
    dotClass: "bg-[#ff9900]",
    activeDotClass: "bg-white/90",
  },
  copilot: {
    activeClass: "bg-gradient-to-br from-[#22c55e] to-[#73e49a]",
    dotClass: "bg-[#22c55e]",
    activeDotClass: "bg-white/90",
  },
  cursor: {
    activeClass: "bg-gradient-to-br from-[#38bdf8] to-[#86dcff]",
    dotClass: "bg-[#38bdf8]",
    activeDotClass: "bg-white/90",
  },
  jetbrains: {
    activeClass: "bg-gradient-to-br from-[#8b5cf6] to-[#b899ff]",
    dotClass: "bg-[#8b5cf6]",
    activeDotClass: "bg-white/90",
  },
};

export const TrayTabBar = ({ entries, activeProvider, onSelect }: TrayTabBarProps) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const providerIds = entries.map((entry) => entry.info.id);

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

  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-1" data-no-drag>
      <div className="relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-[var(--surface-0)]/95 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-7 bg-gradient-to-l from-[var(--surface-0)]/95 to-transparent" />
        <div
          ref={scrollerRef}
          className="tray-tabs-scroll flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="Providers"
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
              activeClass: "bg-gradient-to-br from-teal-500 to-cyan-400",
              dotClass: "bg-slate-400",
              activeDotClass: "bg-white/90",
            };
            return (
            <button
              key={entry.info.id}
              type="button"
              role="tab"
              aria-selected={activeProvider === entry.info.id}
              tabIndex={activeProvider === entry.info.id ? 0 : -1}
              onClick={() => onSelect(entry.info.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-[0.01em] transition-all duration-200",
                activeProvider === entry.info.id
                  ? `border-transparent text-white shadow-[0_10px_22px_rgba(0,0,0,0.35)] ${theme.activeClass}`
                  : "border-border/60 bg-[var(--surface-1)] text-foreground/85 hover:bg-[var(--surface-2)] hover:text-foreground",
              )}
              data-provider-id={entry.info.id}
              data-no-drag
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  activeProvider === entry.info.id ? theme.activeDotClass : theme.dotClass,
                )}
              />
              {entry.info.name}
            </button>
            );
          })}
        </div>
      </div>

      <div className="mt-[1px] flex h-8 items-center gap-1 rounded-full border border-border/60 bg-[var(--surface-1)]/90 px-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => scrollByTabs("left")}
          className="rounded-full p-1 text-muted-foreground transition hover:bg-[var(--surface-1)] hover:text-foreground"
          aria-label="Scroll providers left"
          data-no-drag
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => scrollByTabs("right")}
          className="rounded-full p-1 text-muted-foreground transition hover:bg-[var(--surface-1)] hover:text-foreground"
          aria-label="Scroll providers right"
          data-no-drag
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
