import { useCallback, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "aigauge-theme";

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

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return getSystemTheme();
  });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (): void => {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored !== "light" && stored !== "dark") {
        setTheme(getSystemTheme());
      }
    };

    media.addEventListener("change", onSystemChange);
    return () => {
      media.removeEventListener("change", onSystemChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      toggleTheme,
    }),
    [theme, toggleTheme],
  );
};
