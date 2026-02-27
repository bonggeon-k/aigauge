import { cn } from "@/lib/utils";
import type { DashboardEntry } from "@/hooks/useProvider";

interface TrayTabBarProps {
  entries: DashboardEntry[];
  activeProvider: string;
  onSelect: (providerId: string) => void;
}

const providerColors: Record<string, string> = {
  codex: "#10a37f",
  claude: "#d97706",
  gemini: "#4285f4",
  kiro: "#ff9900",
  copilot: "#22c55e",
  cursor: "#38bdf8",
  jetbrains: "#8b5cf6",
};

export const TrayTabBar = ({ entries, activeProvider, onSelect }: TrayTabBarProps) => (
  <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Providers">
    {entries.map((entry) => (
      <button
        key={entry.info.id}
        type="button"
        role="tab"
        aria-selected={activeProvider === entry.info.id}
        onClick={() => onSelect(entry.info.id)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          activeProvider === entry.info.id
            ? "border-primary/80 bg-primary/15"
            : "border-border/70 bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
        )}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: providerColors[entry.info.id] ?? "#9ca3af" }}
        />
        {entry.info.name}
      </button>
    ))}
  </div>
);
