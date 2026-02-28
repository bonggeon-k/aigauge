import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProvider, type AppConfig, type PluginManifest, type ShortcutInfo, type TelemetryStatus } from "@/hooks/useProvider";
import { useExport } from "@/hooks/useExport";
import { detectPlatform, formatShortcutAccelerator } from "@/lib/platform";

export const SettingsView = () => {
  const { i18n, t } = useTranslation();
  const platform = detectPlatform();
  const providerApi = useProvider();
  const exporter = useExport();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [baselineConfig, setBaselineConfig] = useState<AppConfig | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryStatus | null>(null);

  useEffect(() => {
    void providerApi.getConfig().then((loaded) => {
      setConfig(loaded);
      setBaselineConfig(loaded);
    });
    void providerApi.getKeyboardShortcuts().then(setShortcuts);
    void providerApi.getPlugins().then(setPlugins);
    void providerApi.getTelemetryStatus().then(setTelemetry);
  }, [providerApi]);

  if (!config) {
    return null;
  }

  const save = async () => {
    const updated = await providerApi.updateConfig(config);
    setConfig(updated);
    setBaselineConfig(updated);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const hasUnsavedChanges =
    baselineConfig != null && JSON.stringify(config) !== JSON.stringify(baselineConfig);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-5)]" />
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">{t("settings.theme")}</span>
              <select
                aria-label={t("settings.theme")}
                className="w-full rounded-lg border border-border bg-background px-2 py-2"
                value={config.theme_preference}
                onChange={(event) => setConfig({ ...config, theme_preference: event.currentTarget.value })}
              >
                <option value="system">{t("settings.options.system")}</option>
                <option value="light">{t("settings.options.light")}</option>
                <option value="dark">{t("settings.options.dark")}</option>
              </select>
            </label>

            <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">{t("settings.language")}</span>
              <select
                aria-label={t("settings.language")}
                className="w-full rounded-lg border border-border bg-background px-2 py-2"
                value={config.language}
                onChange={(event) => {
                  const language = event.currentTarget.value;
                  setConfig({ ...config, language });
                  void i18n.changeLanguage(language);
                }}
              >
                <option value="en">English</option>
                <option value="ko">Korean</option>
              </select>
            </label>
          </div>

          <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
            <span className="block text-muted-foreground">{t("settings.monthlyBudget")}</span>
            <div className="inline-flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step={1}
                value={Math.max(0, Math.round(config.monthly_budget_usd ?? 100))}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    monthly_budget_usd: Math.max(0, Number(event.currentTarget.value || 0)),
                  })
                }
                className="h-10 w-full bg-transparent outline-none"
                aria-label={t("settings.monthlyBudget")}
              />
            </div>
          </label>

          <label className="flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              aria-label={t("settings.notificationsWarning")}
              type="checkbox"
              checked={config.notifications.quota_warning}
              onChange={(event) =>
                setConfig({
                  ...config,
                  notifications: { ...config.notifications, quota_warning: event.currentTarget.checked },
                })
              }
            />
            <span>{t("settings.notificationsWarning")}</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              aria-label={t("settings.notificationsCritical")}
              type="checkbox"
              checked={config.notifications.quota_critical}
              onChange={(event) =>
                setConfig({
                  ...config,
                  notifications: { ...config.notifications, quota_critical: event.currentTarget.checked },
                })
              }
            />
            <span>{t("settings.notificationsCritical")}</span>
          </label>

          {hasUnsavedChanges ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t("settings.unsaved")}
            </p>
          ) : null}

          {savedAt ? (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {t("settings.savedAt", { time: savedAt })}
            </p>
          ) : null}

          <Button onClick={save} aria-label={t("settings.save")} className="rounded-full px-5">{t("settings.save")}</Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.shortcuts")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {shortcuts.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2">
              <span>{item.description}</span>
              <kbd className="rounded bg-muted px-2 py-1 text-xs">{formatShortcutAccelerator(item.accelerator, platform)}</kbd>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.telemetry")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("settings.telemetryDesc")}
          </p>
          <label className="flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              type="checkbox"
              aria-label="Enable telemetry"
              checked={telemetry?.enabled ?? false}
              onChange={async (event) => {
                const next = await providerApi.setTelemetryEnabled(event.currentTarget.checked);
                setTelemetry(next);
                setConfig({ ...config, telemetry_enabled: next.enabled });
              }}
            />
            <span>{t("settings.telemetryEnable")}</span>
          </label>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.plugins")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("settings.pluginsDesc")}</p>
          {plugins.length === 0 ? <p>{t("settings.noPlugins")}</p> : null}
          {plugins.map((plugin) => (
            <div key={plugin.id} className="rounded-xl border border-border/70 bg-[var(--surface-1)] px-3 py-2">
              <p className="font-medium">{plugin.name} ({plugin.version})</p>
              <p className="text-xs text-muted-foreground">{plugin.author}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.about")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t("settings.versionLabel")}: 1.0.0</p>
          <p>{t("settings.licenseLabel")}: MIT</p>
          <a href="https://github.com/everygoodnews-ship-it/aigauge" target="_blank" rel="noreferrer" className="text-primary underline">
            {t("settings.githubRepo")}
          </a>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={async () => {
                const next = { ...config, onboarding_complete: false };
                const updated = await providerApi.updateConfig(next);
                setConfig(updated);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("settings.resetOnboarding")}
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={async () => {
                await exporter.exportToFile(
                  { format: "json", include_cost: true },
                  "/tmp/aigauge-export-all.json",
                );
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("settings.exportAll")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
