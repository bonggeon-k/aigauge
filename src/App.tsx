import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, RefreshCw } from "lucide-react";
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

function DashboardApp() {
  const { t } = useTranslation();
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
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [costSummary, setCostSummary] = useState<Awaited<ReturnType<typeof analyticsApi.getCostSummary>> | null>(null);
  const [costHistory, setCostHistory] = useState<Awaited<ReturnType<typeof analyticsApi.getCostHistory>>>([]);
  const [roiAnalysis, setRoiAnalysis] = useState<Awaited<ReturnType<typeof analyticsApi.getROIAnalysis>> | null>(null);
  const [paceAnalysis, setPaceAnalysis] = useState<Awaited<ReturnType<typeof analyticsApi.getPaceAnalysis>> | null>(null);

  const loadDashboard = useCallback(async () => {
    const data = await providerApi.getAllDashboardData();
    setEntries(data);
  }, [providerApi]);

  const loadAnalytics = useCallback(async () => {
    const [summary, history, roi, pace] = await Promise.all([
      analyticsApi.getCostSummary(),
      analyticsApi.getCostHistory(),
      analyticsApi.getROIAnalysis(),
      analyticsApi.getPaceAnalysis(100),
    ]);
    setCostSummary(summary);
    setCostHistory(history);
    setRoiAnalysis(roi);
    setPaceAnalysis(pace);
  }, [analyticsApi]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [config, data, summary, history, roi, pace] = await Promise.all([
        providerApi.getConfig(),
        providerApi.getAllDashboardData(),
        analyticsApi.getCostSummary(),
        analyticsApi.getCostHistory(),
        analyticsApi.getROIAnalysis(),
        analyticsApi.getPaceAnalysis(100),
      ]);
      if (!active) return;
      setEntries(data);
      setCostSummary(summary);
      setCostHistory(history);
      setRoiAnalysis(roi);
      setPaceAnalysis(pace);
      setShowOnboarding(!config.onboarding_complete);
      setLoading(false);
      await checkForUpdate();
    })();

    return () => {
      active = false;
    };
  }, [providerApi, analyticsApi, checkForUpdate]);

  useTauriEvent<DashboardEntry>("usage-updated", () => {
    void loadDashboard();
    void loadAnalytics();
  });

  useTauriEvent<boolean>("force-refresh", () => {
    void loadDashboard();
    void loadAnalytics();
  });

  useTauriEvent<DashboardEntry>("quota-warning", (payload) => {
    setAlert({ level: "warning", message: `${payload.info.name}: quota usage is above 80%` });
  });

  useTauriEvent<DashboardEntry>("quota-critical", (payload) => {
    setAlert({ level: "critical", message: `${payload.info.name}: quota usage is above 95%` });
  });

  useTauriEvent<TrackAlertPayload>("quota-warning-track", (payload) => {
    setAlert({
      level: "warning",
      message: `${payload.provider_id} ${payload.track_kind} track is above 80%`,
    });
  });

  useTauriEvent<TrackAlertPayload>("quota-critical-track", (payload) => {
    setAlert({
      level: "critical",
      message: `${payload.provider_id} ${payload.track_kind} track is above 95%`,
    });
  });

  useTauriEvent<DashboardEntry>("data-stale", (payload) => {
    setAlert({
      level: "warning",
      message: `${payload.info.name}: showing cached data older than 5 minutes`,
    });
  });

  useTauriEvent<boolean>("open-settings", () => {
    setRoute("settings");
  });

  const activeProviderAuth = useMemo<AuthMethod>(() => {
    if (!activeProviderId) return "api_key";
    return entries.find((entry) => entry.info.id === activeProviderId)?.info.auth_method ?? "api_key";
  }, [activeProviderId, entries]);

  const leadEntry = entries[0];
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

                {loading ? (
                  <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <SkeletonCard key={`skeleton-${index}`} />
                    ))}
                  </div>
                ) : entries.length === 0 || entries.every((entry) => !entry.health.configured) ? (
                  <EmptyState onGetStarted={() => setShowOnboarding(true)} />
                ) : (
                  <>
                    <TrayView>
                      <div className="grid gap-4 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
                        {entries.map((entry) => (
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

                    <section className="mt-6 grid gap-4 lg:grid-cols-2">
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
