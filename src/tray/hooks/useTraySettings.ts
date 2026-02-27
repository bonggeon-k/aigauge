import { useEffect, useMemo, useState } from "react";

export interface TraySettings {
  refreshIntervalMinutes: number;
  notifications: boolean;
  enabledProviders: string[];
  pinned: boolean;
}

const STORAGE_KEY = "aigauge.tray.settings";

const defaultSettings: TraySettings = {
  refreshIntervalMinutes: 5,
  notifications: true,
  enabledProviders: ["codex", "claude", "gemini", "kiro"],
  pinned: false,
};

export const useTraySettings = () => {
  const [settings, setSettings] = useState<TraySettings>(() => {
    if (typeof window === "undefined") {
      return defaultSettings;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }
    try {
      return { ...defaultSettings, ...(JSON.parse(raw) as Partial<TraySettings>) };
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return useMemo(
    () => ({
      settings,
      setSettings,
      patchSettings(patch: Partial<TraySettings>) {
        setSettings((prev) => ({ ...prev, ...patch }));
      },
    }),
    [settings],
  );
};
