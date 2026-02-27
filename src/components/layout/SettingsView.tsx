import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProvider, type AppConfig, type PluginManifest, type ShortcutInfo, type TelemetryStatus } from "@/hooks/useProvider";
import { useExport } from "@/hooks/useExport";
import { detectPlatform, formatShortcutAccelerator } from "@/lib/platform";

export const SettingsView = () => {
  const { i18n } = useTranslation();
  const platform = detectPlatform();
  const providerApi = useProvider();
  const exporter = useExport();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryStatus | null>(null);

  useEffect(() => {
    void providerApi.getConfig().then(setConfig);
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
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-1)] via-[var(--chart-2)] to-[var(--chart-5)]" />
        <CardHeader>
          <CardTitle className="tracking-tight">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">Theme</span>
              <select
                aria-label="Theme"
                className="w-full rounded-lg border border-border bg-background px-2 py-2"
                value={config.theme_preference}
                onChange={(event) => setConfig({ ...config, theme_preference: event.currentTarget.value })}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>

            <label className="space-y-1 rounded-xl bg-[var(--surface-1)] p-3">
              <span className="block text-muted-foreground">Language</span>
              <select
                aria-label="Language"
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

          <label className="flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              aria-label="Enable quota warning notifications"
              type="checkbox"
              checked={config.notifications.quota_warning}
              onChange={(event) =>
                setConfig({
                  ...config,
                  notifications: { ...config.notifications, quota_warning: event.currentTarget.checked },
                })
              }
            />
            <span>Quota warning notifications</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl bg-[var(--surface-1)] p-3">
            <input
              aria-label="Enable quota critical notifications"
              type="checkbox"
              checked={config.notifications.quota_critical}
              onChange={(event) =>
                setConfig({
                  ...config,
                  notifications: { ...config.notifications, quota_critical: event.currentTarget.checked },
                })
              }
            />
            <span>Quota critical notifications</span>
          </label>

          <Button onClick={save} aria-label="Save settings" className="rounded-full px-5">Save Settings</Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Keyboard Shortcuts</CardTitle>
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
          <CardTitle className="tracking-tight">Telemetry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Anonymous telemetry is opt-in. It includes only provider count, app version, and OS.
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
            <span>Enable anonymous telemetry</span>
          </label>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-soft)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Plugins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Install TOML manifests from app data directory plugins folder.</p>
          {plugins.length === 0 ? <p>No plugins installed.</p> : null}
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
          <CardTitle className="tracking-tight">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Version: 1.0.0</p>
          <p>License: MIT</p>
          <a href="https://github.com/everygoodnews-ship-it/aigauge" target="_blank" rel="noreferrer" className="text-primary underline">
            GitHub Repository
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
              Reset Onboarding
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
              Export All Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
