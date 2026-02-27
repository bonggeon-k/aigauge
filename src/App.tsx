import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { TrayView } from "@/components/layout/TrayView";
import { ProviderCard } from "@/components/dashboard/ProviderCard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProvider } from "@/hooks/useProvider";
import { useTheme } from "@/hooks/useTheme";

interface ProviderSnapshot {
  id: string;
  authMethod: string;
  requests: number;
  tokens: number;
}

function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const providerApi = useProvider();
  const [providers, setProviders] = useState<ProviderSnapshot[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const items = await providerApi.getProviders();
      const snapshots = await Promise.all(
        items.map(async (item) => {
          const usage = await providerApi.getUsage(item.id);
          return {
            id: item.id,
            authMethod: item.auth_method,
            requests: usage.requests,
            tokens: usage.tokens,
          };
        }),
      );

      if (active) {
        setProviders(snapshots);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [providerApi]);

  return (
    <TooltipProvider>
      <AppShell theme={theme} onToggleTheme={toggleTheme}>
        <section className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t("app.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("app.subtitle")}</p>
        </section>

        <TrayView>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider.id}
                authMethod={provider.authMethod}
                requests={provider.requests}
                tokens={provider.tokens}
                quota={50000}
              />
            ))}
          </div>
        </TrayView>
      </AppShell>
    </TooltipProvider>
  );
}

export default App;
