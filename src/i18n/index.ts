import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/en.json";
import ko from "@/i18n/ko.json";

const LANGUAGE_STORAGE_KEY = "aigauge-language";

const resolveInitialLanguage = (): "en" | "ko" => {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "ko") {
    return stored;
  }

  const browser = window.navigator.language.toLowerCase();
  if (browser.startsWith("ko")) {
    return "ko";
  }

  return "en";
};

const setDocumentLanguage = (language: string): void => {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = language;
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (language) => {
  setDocumentLanguage(language);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
});

setDocumentLanguage(i18n.language || "en");

export default i18n;
