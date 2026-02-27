import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { TrayView } from "@/components/layout/TrayView";
import { SettingsView } from "@/components/layout/SettingsView";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { CostSummary } from "@/components/dashboard/CostSummary";
import { ProviderCard } from "@/components/dashboard/ProviderCard";
import { QuotaTimeline } from "@/components/dashboard/QuotaTimeline";
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
import { useTheme } from "@/hooks/useTheme";

function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const providerApi = useProvider();

  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [alert, setAlert] = useState<{ message: string; level: "warning" | "critical" } | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const data = await providerApi.getAllDashboardData();
    setEntries(data);
  }, [providerApi]);

  useEffect(() => {
    let active = true;
    void providerApi.getAllDashboardData().then((data) => {
      if (active) {
        setEntries(data);
      }
    });

    return () => {
      active = false;
    };
  }, [providerApi]);

  useTauriEvent<DashboardEntry>("usage-updated", () => {
    void loadDashboard();
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

  const activeProviderAuth = useMemo<AuthMethod>(() => {
    if (!activeProviderId) return "api_key";
    return (
      entries.find((entry) => entry.info.id === activeProviderId)?.info.auth_method ??
      "api_key"
    );
  }, [activeProviderId, entries]);

  const leadEntry = entries[0];

  return (
    <TooltipProvider>
      <AppShell theme={theme} onToggleTheme={toggleTheme}>
        {alert ? (
          <AlertBanner
            level={alert.level}
            message={alert.message}
            onDismiss={() => setAlert(null)}
          />
        ) : null}

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
            Add Provider
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

        <section className="mt-6">
          <SettingsView />
        </section>

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
