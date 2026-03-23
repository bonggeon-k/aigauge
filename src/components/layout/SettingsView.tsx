import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    let disposed = false;
    void providerApi.getConfig().then((loaded) => {
      if (disposed) return;
      setConfig(loaded);
      setBaselineConfig(loaded);
    });
    void providerApi.getKeyboardShortcuts().then((value) => {
      if (!disposed) setShortcuts(value);
    });
    void providerApi.getPlugins().then((value) => {
      if (!disposed) setPlugins(value);
    });
    void providerApi.getTelemetryStatus().then((value) => {
      if (!disposed) setTelemetry(value);
    });
    return () => {
      disposed = true;
    };
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
  const themeLabel =
    config.theme_preference === "light"
      ? t("settings.options.light")
      : config.theme_preference === "dark"
        ? t("settings.options.dark")
        : t("settings.options.system");
  const languageLabel = config.language === "ko" ? "한국어" : "English";
  const selectorTriggerClass =
    "ui-field inline-flex h-10 w-full items-center justify-between px-3 text-left text-sm";
  const switchTrackClass = (enabled: boolean): string =>
    `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
      enabled
        ? "border-transparent bg-primary"
        : "border-border/70 bg-[var(--surface-2)]"
    }`;
  const switchThumbClass = (enabled: boolean): string =>
    `inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
      enabled ? "translate-x-[22px]" : "translate-x-[3px]"
    }`;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-5)]" />
        <CardHeader>
          <CardTitle className="tracking-tight">{t("settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">{t("settings.theme")}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={t("settings.theme")} className={selectorTriggerClass}>
                    <span>{themeLabel}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-40 border-border/70 bg-[var(--surface-1)] shadow-[var(--shadow-soft)]"
                >
                  <DropdownMenuRadioGroup
                    value={config.theme_preference}
                    onValueChange={(value) => setConfig({ ...config, theme_preference: value })}
                  >
                    <DropdownMenuRadioItem value="system">
                      {t("settings.options.system")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="light">
                      {t("settings.options.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      {t("settings.options.dark")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">{t("settings.language")}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={t("settings.language")} className={selectorTriggerClass}>
                    <span>{languageLabel}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-40 border-border/70 bg-[var(--surface-1)] shadow-[var(--shadow-soft)]"
                >
                  <DropdownMenuRadioGroup
                    value={config.language}
                    onValueChange={async (value) => {
                      const language = value === "ko" ? "ko" : "en";
                      const next = { ...config, language };
                      setConfig(next);
                      void i18n.changeLanguage(language);
                      try {
                        const updated = await providerApi.updateConfig(next);
                        setConfig(updated);
                        setBaselineConfig(updated);
                        setSavedAt(new Date().toLocaleTimeString());
                      } catch {
                        // Keep local language change even if persistence fails.
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="ko">한국어</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3 md:col-span-2">
              <span className="block text-muted-foreground">{t("settings.monthlyBudget")}</span>
              <div className="inline-flex w-full items-center gap-2 rounded-lg border border-border/70 bg-[var(--surface-2)] px-3">
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
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-1)] p-3">
            <span>{t("settings.notificationsWarning")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={config.notifications.quota_warning}
              aria-label={t("settings.notificationsWarning")}
              className={switchTrackClass(config.notifications.quota_warning)}
              onClick={() =>
                setConfig({
                  ...config,
                  notifications: {
                    ...config.notifications,
                    quota_warning: !config.notifications.quota_warning,
                  },
                })
              }
            >
              <span className={switchThumbClass(config.notifications.quota_warning)} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-1)] p-3">
            <span>{t("settings.notificationsCritical")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={config.notifications.quota_critical}
              aria-label={t("settings.notificationsCritical")}
              className={switchTrackClass(config.notifications.quota_critical)}
              onClick={() =>
                setConfig({
                  ...config,
                  notifications: {
                    ...config.notifications,
                    quota_critical: !config.notifications.quota_critical,
                  },
                })
              }
            >
              <span className={switchThumbClass(config.notifications.quota_critical)} />
            </button>
          </div>

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
              aria-label={t("settings.telemetryEnable")}
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
          <a href="https://github.com/bonggeon-k/aigauge" target="_blank" rel="noreferrer" className="text-primary underline">
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
                  "",
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
