import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "@/components/layout/AppShell";
import { TrayView } from "@/components/layout/TrayView";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { CostSummary } from "@/components/dashboard/CostSummary";
import { ProviderCard } from "@/components/dashboard/ProviderCard";
import { QuotaTimeline } from "@/components/dashboard/QuotaTimeline";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProvider, useTauriEvent, type AuthMethod, type DashboardEntry } from "@/hooks/useProvider";
import { useCostAnalytics } from "@/hooks/useCostAnalytics";
import { useTheme } from "@/hooks/useTheme";
import { useUpdater } from "@/hooks/useUpdater";
import type { AppRoute } from "@/components/layout/Navigation";

const SettingsView = lazy(() =>
  import("@/components/layout/SettingsView").then((module) => ({ default: module.SettingsView })),
);
const CostDashboard = lazy(() =>
  import("@/components/analytics/CostDashboard").then((module) => ({ default: module.CostDashboard })),
);
const ExportPanel = lazy(() =>
  import("@/components/analytics/ExportPanel").then((module) => ({ default: module.ExportPanel })),
);
const ROICalculator = lazy(() =>
  import("@/components/analytics/ROICalculator").then((module) => ({ default: module.ROICalculator })),
);
const WelcomeFlow = lazy(() =>
  import("@/components/onboarding/WelcomeFlow").then((module) => ({ default: module.WelcomeFlow })),
);
const ProviderSetup = lazy(() =>
  import("@/components/providers/ProviderSetup").then((module) => ({ default: module.ProviderSetup })),
);
const ProviderSettings = lazy(() =>
  import("@/components/providers/ProviderSettings").then((module) => ({ default: module.ProviderSettings })),
);
const TrayApp = lazy(() =>
  import("@/tray/TrayApp").then((module) => ({ default: module.TrayApp })),
);

const pageMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

interface TrackAlertPayload {
  provider_id: string;
  track_id: string;
  usage_pct: number;
  track_kind: "subscription" | "api" | "manual";
}

type ProviderSortMode = "risk" | "name" | "cost";

const isTrayRoute = (): boolean => {
  if (typeof window === "undefined") return false;

  // Check hash route
  if (window.location.hash.includes("/tray")) return true;

  // Check pathname (for Tauri window)
  if (window.location.pathname.startsWith("/tray")) return true;

  // Check Tauri window label
  try {
    return getCurrentWindow().label === "tray-popup";
  } catch {
    return false;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isBooleanPayload = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isDashboardEntryPayload = (value: unknown): value is DashboardEntry =>
  isRecord(value) &&
  isRecord(value.info) &&
  typeof value.info.name === "string" &&
  isRecord(value.usage) &&
  typeof value.usage.status === "string";

const isTrackAlertPayload = (value: unknown): value is TrackAlertPayload =>
  isRecord(value) &&
  typeof value.provider_id === "string" &&
  typeof value.track_id === "string" &&
  typeof value.usage_pct === "number" &&
  typeof value.track_kind === "string";

function DashboardApp() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const providerApi = useProvider();
  const analyticsApi = useCostAnalytics();
  const updater = useUpdater();
  const { checkForUpdate } = updater;

  const [route, setRoute] = useState<AppRoute>("dashboard");
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [alert, setAlert] = useState<{ message: string; level: "warning" | "critical" } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [paceBudget, setPaceBudget] = useState(100);
  const [providerQuery, setProviderQuery] = useState("");
  const [providerSort, setProviderSort] = useState<ProviderSortMode>("risk");
  const refreshTimerRef = useRef<number | null>(null);

  const [costSummary, setCostSummary] = useState<Awaited<ReturnType<typeof analyticsApi.getCostSummary>> | null>(null);
  const [costHistory, setCostHistory] = useState<Awaited<ReturnType<typeof analyticsApi.getCostHistory>>>([]);
  const [roiAnalysis, setRoiAnalysis] = useState<Awaited<ReturnType<typeof analyticsApi.getROIAnalysis>> | null>(null);
  const [paceAnalysis, setPaceAnalysis] = useState<Awaited<ReturnType<typeof analyticsApi.getPaceAnalysis>> | null>(null);

  const loadDashboard = useCallback(async () => {
    const data = await providerApi.getAllDashboardData();
    setEntries(data);
  }, [providerApi]);

  const loadAnalytics = useCallback(async () => {
    const [summary, history, roi, config] = await Promise.all([
      analyticsApi.getCostSummary(),
      analyticsApi.getCostHistory(),
      analyticsApi.getROIAnalysis(),
      providerApi.getConfig(),
    ]);
    const configuredBudget =
      typeof config.monthly_budget_usd === "number" && Number.isFinite(config.monthly_budget_usd)
        ? Math.max(0, config.monthly_budget_usd)
        : 100;
    const pace = await analyticsApi.getPaceAnalysis(configuredBudget);
    setPaceBudget(configuredBudget);
    setCostSummary(summary);
    setCostHistory(history);
    setRoiAnalysis(roi);
    setPaceAnalysis(pace);
  }, [analyticsApi, providerApi]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setInitError(null);
    try {
      const [config, data, summary, history, roi] = await Promise.all([
        providerApi.getConfig(),
        providerApi.getAllDashboardData(),
        analyticsApi.getCostSummary(),
        analyticsApi.getCostHistory(),
        analyticsApi.getROIAnalysis(),
      ]);
      const configuredBudget =
        typeof config.monthly_budget_usd === "number" && Number.isFinite(config.monthly_budget_usd)
          ? Math.max(0, config.monthly_budget_usd)
          : 100;
      const pace = await analyticsApi.getPaceAnalysis(configuredBudget);

      setEntries(data);
      setCostSummary(summary);
      setCostHistory(history);
      setRoiAnalysis(roi);
      setPaceAnalysis(pace);
      setPaceBudget(configuredBudget);
      setShowOnboarding(!config.onboarding_complete);
      if (config.language && config.language !== i18n.language) {
        await i18n.changeLanguage(config.language);
      }
      await checkForUpdate();
    } catch {
      setInitError(t("app.loadError"));
    } finally {
      setLoading(false);
    }
  }, [providerApi, analyticsApi, checkForUpdate, i18n, t]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useTauriEvent<DashboardEntry>("usage-updated", () => {
    if (refreshTimerRef.current != null) {
      return;
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadDashboard();
      void loadAnalytics();
    }, 300);
  }, isDashboardEntryPayload);

  useTauriEvent<boolean>("force-refresh", () => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    void loadDashboard();
    void loadAnalytics();
  }, isBooleanPayload);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  useTauriEvent<DashboardEntry>("quota-warning", (payload) => {
    setAlert({ level: "warning", message: `${payload.info.name}: quota usage is above 80%` });
  }, isDashboardEntryPayload);

  useTauriEvent<DashboardEntry>("quota-critical", (payload) => {
    setAlert({ level: "critical", message: `${payload.info.name}: quota usage is above 95%` });
  }, isDashboardEntryPayload);

  useTauriEvent<TrackAlertPayload>("quota-warning-track", (payload) => {
    setAlert({
      level: "warning",
      message: `${payload.provider_id} ${payload.track_kind} track is above 80%`,
    });
  }, isTrackAlertPayload);

  useTauriEvent<TrackAlertPayload>("quota-critical-track", (payload) => {
    setAlert({
      level: "critical",
      message: `${payload.provider_id} ${payload.track_kind} track is above 95%`,
    });
  }, isTrackAlertPayload);

  useTauriEvent<DashboardEntry>("data-stale", (payload) => {
    setAlert({
      level: "warning",
      message: `${payload.info.name}: showing cached data older than 5 minutes`,
    });
  }, isDashboardEntryPayload);

  useTauriEvent<boolean>("open-settings", () => {
    setRoute("settings");
  }, isBooleanPayload);

  useTauriEvent<boolean>("open-dashboard", () => {
    setRoute("dashboard");
  }, isBooleanPayload);

  const activeProviderAuth = useMemo<AuthMethod>(() => {
    if (!activeProviderId) return "api_key";
    return entries.find((entry) => entry.info.id === activeProviderId)?.info.auth_method ?? "api_key";
  }, [activeProviderId, entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = providerQuery.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        entry.info.name.toLowerCase().includes(normalizedQuery) ||
        entry.info.id.toLowerCase().includes(normalizedQuery) ||
        entry.info.plan_name.toLowerCase().includes(normalizedQuery)
      );
    });

    const toRisk = (entry: DashboardEntry): number => {
      const track = entry.tracks.find((item) => item.kind === "subscription");
      if (track && track.limit > 0) {
        return track.used / track.limit;
      }
      if (entry.quota.limit > 0) {
        return entry.quota.used / entry.quota.limit;
      }
      return 0;
    };

    return filtered.sort((a, b) => {
      if (providerSort === "name") {
        return a.info.name.localeCompare(b.info.name);
      }
      if (providerSort === "cost") {
        const aCost = a.cost?.total ?? a.cost_view.total ?? 0;
        const bCost = b.cost?.total ?? b.cost_view.total ?? 0;
        return bCost - aCost;
      }
      return toRisk(b) - toRisk(a);
    });
  }, [entries, providerQuery, providerSort]);

  const leadEntry = filteredEntries[0] ?? entries[0];
  const updateBanner = updater.updateAvailable ? (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-live="polite">
      <p>New version {updater.updateAvailable.version} available.</p>
      <Button size="sm" onClick={async () => { await updater.installUpdate(); }} aria-label="Install update">
        <RefreshCw className="mr-2 h-4 w-4" />
        Install update
      </Button>
    </div>
  ) : null;

  if (showOnboarding) {
    return (
      <TooltipProvider>
        <AppShell theme={theme} onToggleTheme={toggleTheme} route={route} onNavigate={setRoute} updateBanner={updateBanner}>
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading onboarding...</div>}>
            <WelcomeFlow
              providerIds={["codex", "claude", "gemini", "kiro", "copilot", "cursor", "jetbrains"]}
              onComplete={async (selected) => {
                const config = await providerApi.getConfig();
                await providerApi.updateConfig({
                  ...config,
                  onboarding_complete: true,
                  enabled_providers: selected,
                });
                setShowOnboarding(false);
              }}
              onSkip={async () => {
                const config = await providerApi.getConfig();
                await providerApi.updateConfig({ ...config, onboarding_complete: true });
                setShowOnboarding(false);
              }}
            />
          </Suspense>
        </AppShell>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <AppShell theme={theme} onToggleTheme={toggleTheme} route={route} onNavigate={setRoute} updateBanner={updateBanner}>
        {alert ? <AlertBanner level={alert.level} message={alert.message} onDismiss={() => setAlert(null)} /> : null}

        <AnimatePresence mode="wait">
          <motion.div key={route} variants={pageMotion} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.26 }}>
            {route === "dashboard" ? (
              <>
                <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t("app.title")}</h1>
                    <p className="text-sm text-muted-foreground">{t("app.subtitle")}</p>
                  </div>
                  <Button
                    onClick={() => {
                      setActiveProviderId(entries.find((entry) => !entry.health.configured)?.info.id ?? "codex");
                      setSetupOpen(true);
                    }}
                    aria-label="Add provider"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("app.addProvider")}
                  </Button>
                </section>

                <section className="mb-5 grid gap-3 rounded-2xl border border-border/70 bg-[var(--glass-bg)] p-3 shadow-[var(--shadow-soft)] md:grid-cols-[1fr_auto_auto]">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={providerQuery}
                      onChange={(event) => setProviderQuery(event.currentTarget.value)}
                      placeholder={t("app.searchPlaceholder")}
                      className="h-10 w-full rounded-xl border border-border/70 bg-[var(--surface-1)] pl-9 pr-3 text-sm outline-none transition focus:border-primary/60"
                      aria-label={t("app.searchPlaceholder")}
                    />
                  </label>

                  <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-[var(--surface-1)] px-2 py-1 text-sm text-muted-foreground">
                    <span className="px-1">{t("app.sortBy")}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {([
                        ["risk", t("app.sort.risk")],
                        ["name", t("app.sort.name")],
                        ["cost", t("app.sort.cost")],
                      ] as const).map(([value, label]) => {
                        const selected = providerSort === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-label={`${t("app.sortBy")}: ${label}`}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                              selected
                                ? "bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(0,0,0,0.2)]"
                                : "bg-[var(--surface-2)] text-foreground/85 hover:bg-[var(--surface-2)]/80"
                            }`}
                            onClick={() => setProviderSort(value)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="inline-flex items-center rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 text-sm text-muted-foreground">
                    {t("app.providersCount", { count: filteredEntries.length })}
                  </div>
                </section>

                {loading ? (
                  <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <SkeletonCard key={`skeleton-${index}`} />
                    ))}
                  </div>
                ) : initError ? (
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm">
                    <p className="font-medium text-rose-700 dark:text-rose-300">{initError}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-rose-700/80 dark:text-rose-300/80">
                      <span>{t("app.budgetInUse", { budget: paceBudget.toFixed(0) })}</span>
                    </div>
                    <Button variant="outline" className="mt-4 rounded-full" onClick={() => void loadInitialData()}>
                      {t("app.retry")}
                    </Button>
                  </div>
                ) : entries.length === 0 || entries.every((entry) => !entry.health.configured) ? (
                  <EmptyState onGetStarted={() => setShowOnboarding(true)} />
                ) : filteredEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-[var(--surface-1)] p-8 text-center text-sm text-muted-foreground">
                    <p>{t("app.noResults")}</p>
                    <Button variant="outline" className="mt-3 rounded-full" onClick={() => setProviderQuery("")}>
                      {t("app.clearFilter")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <TrayView>
                      <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
                        {filteredEntries.map((entry) => (
                          <ProviderCard
                            key={entry.info.id}
                            entry={entry}
                            onSetup={(providerId) => {
                              setActiveProviderId(providerId);
                              setSetupOpen(true);
                            }}
                            onOpenSettings={(providerId) => {
                              setActiveProviderId(providerId);
                              setSettingsOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </TrayView>

                    <section className="mt-6 grid gap-4 lg:auto-rows-fr lg:grid-cols-2">
                      <CostSummary entries={entries} />
                      {leadEntry ? (
                        <QuotaTimeline
                          used={leadEntry.quota.used}
                          limit={leadEntry.quota.limit}
                          periodStart={leadEntry.usage.period_start}
                          periodEnd={leadEntry.usage.period_end}
                        />
                      ) : null}
                    </section>
                  </>
                )}
              </>
            ) : null}

            {route === "analytics" ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading analytics...</div>}>
                <section className="grid gap-4">
                  <CostDashboard summary={costSummary} history={costHistory} pace={paceAnalysis} />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <ROICalculator roi={roiAnalysis} />
                    <ExportPanel providers={entries.map((entry) => entry.info.id)} />
                  </div>
                </section>
              </Suspense>
            ) : null}

            {route === "settings" ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading settings...</div>}>
                <SettingsView />
              </Suspense>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <Suspense fallback={null}>
          <ProviderSetup
            open={setupOpen}
            providerId={activeProviderId}
            authMethod={activeProviderAuth}
            onClose={() => setSetupOpen(false)}
            onSaved={() => {
              setSetupOpen(false);
              void loadDashboard();
            }}
          />

          <ProviderSettings
            open={settingsOpen}
            providerId={activeProviderId}
            onClose={() => {
              setSettingsOpen(false);
              void loadDashboard();
            }}
          />
        </Suspense>
      </AppShell>
    </TooltipProvider>
  );
}

function App() {
  if (isTrayRoute()) {
    return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading tray...</div>}>
        <TrayApp />
      </Suspense>
    );
  }
  return <DashboardApp />;
}

export default App;
