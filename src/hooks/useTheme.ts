import { useCallback, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";

const THEME_STORAGE_KEY = "aigauge-theme";
const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

const getSystemTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (theme: ThemeMode): void => {
  document.documentElement.classList.toggle("dark", theme === "dark");
};

const normalizeThemePreference = (value: string | null | undefined): ThemePreference => {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return DEFAULT_THEME_PREFERENCE;
};

const resolveTheme = (preference: ThemePreference): ThemeMode =>
  preference === "system" ? getSystemTheme() : preference;

interface UseThemeOptions {
  preference?: string;
  onPreferenceChange?: (preference: ThemePreference) => void | Promise<void>;
}

export const useTheme = (options?: UseThemeOptions) => {
  const isControlled = options?.preference != null;
  const [internalPreference, setInternalPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_THEME_PREFERENCE;
    }
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  });
  const themePreference = normalizeThemePreference(options?.preference ?? internalPreference);
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(() => getSystemTheme());
  const theme = themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (): void => {
      const stored = normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
      if (stored === "system") {
        setSystemTheme(getSystemTheme());
      }
    };

    media.addEventListener("change", onSystemChange);
    return () => {
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }
      const nextPreference = normalizeThemePreference(event.newValue);
      if (!isControlled) {
        setInternalPreference(nextPreference);
      }
      if (nextPreference === "system") {
        setSystemTheme(getSystemTheme());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [isControlled]);

  const setThemePreference = useCallback(
    (nextPreference: ThemePreference) => {
      const normalized = normalizeThemePreference(nextPreference);
      if (!isControlled) {
        setInternalPreference(normalized);
      }
      void options?.onPreferenceChange?.(normalized);
    },
    [isControlled, options],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemePreference = resolveTheme(themePreference) === "dark" ? "light" : "dark";
    setThemePreference(nextTheme);
  }, [setThemePreference, themePreference]);

  return useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      themePreference,
      setThemePreference,
      toggleTheme,
    }),
    [theme, themePreference, setThemePreference, toggleTheme],
  );
};
