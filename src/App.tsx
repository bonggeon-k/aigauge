import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useProvider,
  useTauriEvent,
  type AppConfig,
  type AuthMethod,
  type DashboardEntry,
  type ProviderDescriptor,
} from "@/hooks/useProvider";
import { useCostAnalytics } from "@/hooks/useCostAnalytics";
import { useTheme, type ThemePreference } from "@/hooks/useTheme";
import { useUpdater } from "@/hooks/useUpdater";
import type { AppRoute } from "@/components/layout/Navigation";

const AppShell = lazy(() =>
  import("@/components/layout/AppShell").then((module) => ({ default: module.AppShell })),
);
const TrayView = lazy(() =>
  import("@/components/layout/TrayView").then((module) => ({ default: module.TrayView })),
);
const AlertBanner = lazy(() =>
  import("@/components/dashboard/AlertBanner").then((module) => ({ default: module.AlertBanner })),
);
const CostSummary = lazy(() =>
  import("@/components/dashboard/CostSummary").then((module) => ({ default: module.CostSummary })),
);
const ProviderCard = lazy(() =>
  import("@/components/dashboard/ProviderCard").then((module) => ({ default: module.ProviderCard })),
);
const QuotaTimeline = lazy(() =>
  import("@/components/dashboard/QuotaTimeline").then((module) => ({ default: module.QuotaTimeline })),
);
const SkeletonCard = lazy(() =>
  import("@/components/ui/SkeletonCard").then((module) => ({ default: module.SkeletonCard })),
);
const EmptyState = lazy(() =>
  import("@/components/ui/EmptyState").then((module) => ({ default: module.EmptyState })),
);
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
const PaceIndicator = lazy(() =>
  import("@/components/analytics/PaceIndicator").then((module) => ({ default: module.PaceIndicator })),
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

const isAppConfigPayload = (value: unknown): value is AppConfig =>
  isRecord(value) &&
  typeof value.language === "string" &&
  typeof value.theme_preference === "string" &&
  Array.isArray(value.enabled_providers);

const dashboardProviderGridClass =
  "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(21rem,100%),1fr))] [grid-auto-rows:1fr] items-stretch";

function DashboardApp() {
  const { t, i18n } = useTranslation();
  const providerApi = useProvider();
  const analyticsApi = useCostAnalytics();
  const updater = useUpdater();
  const { checkForUpdate } = updater;
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const persistThemePreference = useCallback(
    async (nextPreference: ThemePreference) => {
      setThemePreference(nextPreference);
      try {
        const config = await providerApi.getConfig();
        const updated = await providerApi.updateConfig({
          ...config,
          theme_preference: nextPreference,
        });
        if (
          updated.theme_preference === "light" ||
          updated.theme_preference === "dark" ||
          updated.theme_preference === "system"
        ) {
          setThemePreference(updated.theme_preference);
        }
      } catch {
        // Keep the in-memory preference even if persistence fails.
      }
    },
    [providerApi],
  );
  const { theme, toggleTheme } = useTheme({
    preference: themePreference,
    onPreferenceChange: persistThemePreference,
  });

  const [route, setRoute] = useState<AppRoute>("dashboard");
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [alert, setAlert] = useState<{ message: string; level: "warning" | "critical" } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerCatalog, setProviderCatalog] = useState<ProviderDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [paceBudget, setPaceBudget] = useState(100);
  const [providerQuery, setProviderQuery] = useState("");
  const [providerSort, setProviderSort] = useState<ProviderSortMode>("risk");
  const refreshTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

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
      const [config, data, summary, history, roi, providers] = await Promise.all([
        providerApi.getConfig(),
        providerApi.getAllDashboardData(),
        analyticsApi.getCostSummary(),
        analyticsApi.getCostHistory(),
        analyticsApi.getROIAnalysis(),
        providerApi.getProviders(),
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
      if (
        config.theme_preference === "light" ||
        config.theme_preference === "dark" ||
        config.theme_preference === "system"
      ) {
        setThemePreference(config.theme_preference);
      }
      setShowOnboarding(!config.onboarding_complete);
      setProviderCatalog(providers);
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

  const openProviderPicker = useCallback(async () => {
    if (providerCatalog.length === 0) {
      try {
        const providers = await providerApi.getProviders();
        setProviderCatalog(providers);
      } catch {
        setProviderCatalog([]);
      }
    }
    setProviderPickerOpen(true);
  }, [providerApi, providerCatalog.length]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const runRefreshCycle = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    try {
      do {
        refreshQueuedRef.current = false;
        await loadDashboard();
        if (route === "analytics") {
          await loadAnalytics();
        }
      } while (refreshQueuedRef.current);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [loadDashboard, loadAnalytics, route]);

  useTauriEvent<DashboardEntry>("usage-updated", () => {
    if (refreshTimerRef.current != null) {
      return;
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void runRefreshCycle();
    }, 800);
  }, isDashboardEntryPayload);

  useTauriEvent<boolean>("force-refresh", () => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    void runRefreshCycle();
  }, isBooleanPayload);

  useTauriEvent<AppConfig>(
    "config-updated",
    (config) => {
      if (config.language && config.language !== i18n.language) {
        void i18n.changeLanguage(config.language);
      }
      if (
        config.theme_preference === "light" ||
        config.theme_preference === "dark" ||
        config.theme_preference === "system"
      ) {
        setThemePreference(config.theme_preference);
      }
      if (typeof config.onboarding_complete === "boolean") {
        setShowOnboarding(!config.onboarding_complete);
      }
      if (typeof config.monthly_budget_usd === "number" && Number.isFinite(config.monthly_budget_usd)) {
        const configuredBudget = Math.max(0, config.monthly_budget_usd);
        setPaceBudget(configuredBudget);
        void analyticsApi
          .getPaceAnalysis(configuredBudget)
          .then((pace) => {
            setPaceAnalysis(pace);
          })
          .catch(() => {
            // Keep the last visible pace analysis if refresh fails.
          });
      }
    },
    isAppConfigPayload,
  );

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const formatTrackKindLabel = useCallback(
    (kind: TrackAlertPayload["track_kind"]): string => {
      switch (kind) {
        case "subscription":
          return t("app.trackKind.subscription");
        case "api":
          return t("app.trackKind.api");
        case "manual":
          return t("app.trackKind.manual");
        default:
          return kind;
      }
    },
    [t],
  );

  useTauriEvent<DashboardEntry>("quota-warning", (payload) => {
    setAlert({
      level: "warning",
      message: t("app.alerts.quotaWarning", { provider: payload.info.name }),
    });
  }, isDashboardEntryPayload);

  useTauriEvent<DashboardEntry>("quota-critical", (payload) => {
    setAlert({
      level: "critical",
      message: t("app.alerts.quotaCritical", { provider: payload.info.name }),
    });
  }, isDashboardEntryPayload);

  useTauriEvent<TrackAlertPayload>("quota-warning-track", (payload) => {
    setAlert({
      level: "warning",
      message: t("app.alerts.trackWarning", {
        provider: payload.provider_id,
        track: formatTrackKindLabel(payload.track_kind),
      }),
    });
  }, isTrackAlertPayload);

  useTauriEvent<TrackAlertPayload>("quota-critical-track", (payload) => {
    setAlert({
      level: "critical",
      message: t("app.alerts.trackCritical", {
        provider: payload.provider_id,
        track: formatTrackKindLabel(payload.track_kind),
      }),
    });
  }, isTrackAlertPayload);

  useTauriEvent<DashboardEntry>("data-stale", (payload) => {
    setAlert({
      level: "warning",
      message: t("app.alerts.dataStale", { provider: payload.info.name }),
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
    return (
      entries.find((entry) => entry.info.id === activeProviderId)?.info.auth_method ??
      providerCatalog.find((provider) => provider.id === activeProviderId)?.auth_method ??
      "api_key"
    );
  }, [activeProviderId, entries, providerCatalog]);

  const activeProviderInfo = useMemo(
    () => entries.find((entry) => entry.info.id === activeProviderId)?.info ?? null,
    [activeProviderId, entries],
  );

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

  const configuredProviderIds = useMemo(
    () =>
      new Set(
        entries
          .filter((entry) => entry.health.configured)
          .map((entry) => entry.info.id),
      ),
    [entries],
  );

  const selectableProviders = useMemo(() => {
    return [...providerCatalog].sort((a, b) => a.name.localeCompare(b.name));
  }, [providerCatalog]);

  const onboardingProviders = useMemo<ProviderDescriptor[]>(() => {
    if (providerCatalog.length > 0) {
      return providerCatalog;
    }
    return [
      { id: "codex", name: "OpenAI Codex", auth_method: "oauth" },
      { id: "claude", name: "Claude", auth_method: "oauth" },
      { id: "gemini", name: "Gemini", auth_method: "oauth" },
      { id: "kiro", name: "Kiro", auth_method: "none" },
      { id: "copilot", name: "GitHub Copilot", auth_method: "oauth" },
      { id: "cursor", name: "Cursor", auth_method: "token" },
      { id: "jetbrains", name: "JetBrains AI", auth_method: "none" },
    ];
  }, [providerCatalog]);

  const leadEntry = filteredEntries[0] ?? entries[0];
  const leadSubscriptionTrack = leadEntry?.tracks.find((track) => track.kind === "subscription");
  const updateBanner = updater.updateAvailable ? (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-live="polite">
      <p>{t("app.updateAvailable", { version: updater.updateAvailable.version })}</p>
      <Button size="sm" onClick={async () => { await updater.installUpdate(); }} aria-label={t("app.installUpdate")}>
        <RefreshCw className="mr-2 h-4 w-4" />
        {t("app.installUpdate")}
      </Button>
    </div>
  ) : null;

  if (showOnboarding) {
    return (
      <TooltipProvider>
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">{t("app.loading.onboarding")}</div>}>
          <AppShell theme={theme} onToggleTheme={toggleTheme} route={route} onNavigate={setRoute} updateBanner={updateBanner}>
            <WelcomeFlow
              providers={onboardingProviders}
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
          </AppShell>
        </Suspense>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">{t("app.loading.dashboard")}</div>}>
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
                      void openProviderPicker();
                    }}
                    aria-label={t("app.addProvider")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("app.addProvider")}
                  </Button>
                </section>

                <section className="mb-5 rounded-2xl border border-border/70 bg-[var(--glass-bg)] p-3 shadow-[var(--shadow-soft)]">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
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

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-[var(--surface-1)] px-2 py-1 text-sm text-muted-foreground">
                        <span className="px-1">{t("app.sortBy")}</span>
                        <div className="grid min-w-[16rem] grid-cols-3 gap-1">
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

                      <div className="inline-flex items-center rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-sm text-muted-foreground">
                        {t("app.providersCount", { count: filteredEntries.length })}
                      </div>
                    </div>
                  </div>
                </section>

                {loading ? (
                  <div className={dashboardProviderGridClass}>
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
                      <div className={dashboardProviderGridClass} aria-live="polite">
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

                    <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                      <CostSummary entries={entries} />
                      {leadEntry ? (
                        <QuotaTimeline
                          used={leadSubscriptionTrack?.used ?? leadEntry.quota.used}
                          limit={leadSubscriptionTrack?.limit ?? leadEntry.quota.limit}
                          periodStart={leadEntry.usage.period_start}
                          periodEnd={leadSubscriptionTrack?.reset_at || leadEntry.usage.period_end}
                          resetAt={leadSubscriptionTrack?.reset_at || leadEntry.quota.reset_at}
                          resetPeriod={leadEntry.info.reset_period}
                        />
                      ) : null}
                    </section>
                  </>
                )}
              </>
            ) : null}

            {route === "analytics" ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t("app.loading.analytics")}</div>}>
                <section className="grid gap-4">
                  <CostDashboard summary={costSummary} history={costHistory} />
                  <div className="grid items-stretch gap-4 xl:grid-cols-12">
                    <div className="min-w-0 xl:col-span-7">
                      <ROICalculator roi={roiAnalysis} />
                    </div>
                    <div className="grid min-w-0 gap-4 xl:col-span-5 xl:grid-rows-[auto_minmax(0,1fr)]">
                      <div className="min-w-0">
                        <PaceIndicator pace={paceAnalysis} />
                      </div>
                      <div className="min-h-0 min-w-0">
                        <ExportPanel providers={entries.map((entry) => entry.info.id)} />
                      </div>
                    </div>
                  </div>
                </section>
              </Suspense>
            ) : null}

            {route === "settings" ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t("app.loading.settings")}</div>}>
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
              providerInfo={activeProviderInfo}
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

              <Dialog open={providerPickerOpen} onOpenChange={setProviderPickerOpen}>
            <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]">
              <DialogHeader>
                <DialogTitle>{t("app.providerPicker.title")}</DialogTitle>
                <DialogDescription>
                  {t("app.providerPicker.description")}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {selectableProviders.length === 0 ? (
                  <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-3 text-sm text-muted-foreground">
                    {t("app.providerPicker.empty")}
                  </div>
                ) : null}
                {selectableProviders.map((provider) => {
                  const configured = configuredProviderIds.has(provider.id);
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2 text-left transition hover:bg-[var(--surface-2)]"
                      onClick={() => {
                        setActiveProviderId(provider.id);
                        setProviderPickerOpen(false);
                        setSetupOpen(true);
                      }}
                    >
                      <span>
                        <span className="block text-sm font-medium">{provider.name}</span>
                        <span className="text-xs text-muted-foreground">{provider.id}</span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] ${
                          configured
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {configured
                          ? t("app.providerPicker.configured")
                          : t("app.providerPicker.notConfigured")}
                      </span>
                    </button>
                  );
                })}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const providers = await providerApi.getProviders();
                    setProviderCatalog(providers);
                  }}
                >
                  {t("app.providerPicker.refreshList")}
                </Button>
                <Button variant="ghost" onClick={() => setProviderPickerOpen(false)}>
                  {t("app.providerPicker.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Suspense>
      </AppShell>
      </Suspense>
    </TooltipProvider>
  );
}

function App() {
  const { t } = useTranslation();
  if (isTrayRoute()) {
    return (
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">{t("app.loading.tray")}</div>}>
        <TrayApp />
      </Suspense>
    );
  }
  return <DashboardApp />;
}

export default App;
