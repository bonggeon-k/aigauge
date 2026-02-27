import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProvider, type AppConfig } from "@/hooks/useProvider";

export const SettingsView = () => {
  const providerApi = useProvider();
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    void providerApi.getConfig().then(setConfig);
  }, [providerApi]);

  if (!config) {
    return null;
  }

  const save = async () => {
    const updated = await providerApi.updateConfig(config);
    setConfig(updated);
  };

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-muted-foreground">Theme</span>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2"
              value={config.theme_preference}
              onChange={(event) =>
                setConfig({ ...config, theme_preference: event.currentTarget.value })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-muted-foreground">Language</span>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2"
              value={config.language}
              onChange={(event) =>
                setConfig({ ...config, language: event.currentTarget.value })
              }
            >
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.notifications.quota_warning}
            onChange={(event) =>
              setConfig({
                ...config,
                notifications: {
                  ...config.notifications,
                  quota_warning: event.currentTarget.checked,
                },
              })
            }
          />
          <span>Quota warning notifications</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.notifications.quota_critical}
            onChange={(event) =>
              setConfig({
                ...config,
                notifications: {
                  ...config.notifications,
                  quota_critical: event.currentTarget.checked,
                },
              })
            }
          />
          <span>Quota critical notifications</span>
        </label>

        <Button onClick={save}>Save Settings</Button>
      </CardContent>
    </Card>
  );
};
