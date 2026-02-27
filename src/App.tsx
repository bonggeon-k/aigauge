import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { TrayView } from "@/components/layout/TrayView";
import { SettingsView } from "@/components/layout/SettingsView";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { CostSummary } from "@/components/dashboard/CostSummary";
import { ProviderCard } from "@/components/dashboard/ProviderCard";
import { QuotaTimeline } from "@/components/dashboard/QuotaTimeline";
import { CostDashboard } from "@/components/analytics/CostDashboard";
import { ExportPanel } from "@/components/analytics/ExportPanel";
import { ROICalculator } from "@/components/analytics/ROICalculator";
import { ProviderSetup } from "@/components/providers/ProviderSetup";
import { ProviderSettings } from "@/components/providers/ProviderSettings";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  useProvider,
  useTauriEvent,
  type AuthMethod,
  type DashboardEntry,
} from "@/hooks/useProvider";
import { useCostAnalytics } from "@/hooks/useCostAnalytics";
import { useTheme } from "@/hooks/useTheme";
import { useUpdater } from "@/hooks/useUpdater";
import type { AppRoute } from "@/components/layout/Navigation";

function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const providerApi = useProvider();
  const analyticsApi = useCostAnalytics();
  const updater = useUpdater();
  const { checkForUpdate } = updater;

  const [route, setRoute] = useState<AppRoute>("dashboard");
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [alert, setAlert] = useState<{ message: string; level: "warning" | "critical" } | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  const [costSummary, setCostSummary] = useState<Awaited<
    ReturnType<typeof analyticsApi.getCostSummary>
  > | null>(null);
  const [costHistory, setCostHistory] = useState<Awaited<
    ReturnType<typeof analyticsApi.getCostHistory>
  >>([]);
  const [roiAnalysis, setRoiAnalysis] = useState<Awaited<
    ReturnType<typeof analyticsApi.getROIAnalysis>
  > | null>(null);
  const [paceAnalysis, setPaceAnalysis] = useState<Awaited<
    ReturnType<typeof analyticsApi.getPaceAnalysis>
  > | null>(null);

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
      const [data, summary, history, roi, pace] = await Promise.all([
        providerApi.getAllDashboardData(),
        analyticsApi.getCostSummary(),
        analyticsApi.getCostHistory(),
        analyticsApi.getROIAnalysis(),
        analyticsApi.getPaceAnalysis(100),
      ]);
      if (!active) {
        return;
      }
      setEntries(data);
      setCostSummary(summary);
      setCostHistory(history);
      setRoiAnalysis(roi);
      setPaceAnalysis(pace);
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

  useTauriEvent<DashboardEntry>("quota-warning", (payload) => {
    setAlert({
      level: "warning",
      message: `${payload.info.name}: quota usage is above 80%`,
    });
  });

  useTauriEvent<DashboardEntry>("quota-critical", (payload) => {
    setAlert({
      level: "critical",
      message: `${payload.info.name}: quota usage is above 95%`,
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
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>
        New version {updater.updateAvailable.version} available.
      </p>
      <Button
        size="sm"
        onClick={async () => {
          await updater.installUpdate();
        }}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Install update
      </Button>
    </div>
  ) : null;

  return (
    <TooltipProvider>
      <AppShell
        theme={theme}
        onToggleTheme={toggleTheme}
        route={route}
        onNavigate={setRoute}
        updateBanner={updateBanner}
      >
        {alert ? (
          <AlertBanner level={alert.level} message={alert.message} onDismiss={() => setAlert(null)} />
        ) : null}

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
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("app.addProvider")}
              </Button>
            </section>

            <TrayView>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        ) : null}

        {route === "analytics" ? (
          <section className="grid gap-4">
            <CostDashboard summary={costSummary} history={costHistory} pace={paceAnalysis} />
            <div className="grid gap-4 xl:grid-cols-2">
              <ROICalculator roi={roiAnalysis} />
              <ExportPanel providers={entries.map((entry) => entry.info.id)} />
            </div>
          </section>
        ) : null}

        {route === "settings" ? <SettingsView /> : null}

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
      </AppShell>
    </TooltipProvider>
  );
}

export default App;
