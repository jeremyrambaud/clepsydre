import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import en from "./resources/en";
import fr from "./resources/fr";

export type AppLanguage = "en" | "fr";

const FALLBACK_LANGUAGE: AppLanguage = "en";

function normalizeLocaleToLanguage(locale: string | null | undefined): AppLanguage | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function getPersistedLanguage(): AppLanguage | null {
  try {
    const raw = localStorage.getItem("clepsydre-settings");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: {
        settings?: {
          language?: unknown;
        };
      };
    };

    const persisted = parsed?.state?.settings?.language;
    return normalizeLocaleToLanguage(typeof persisted === "string" ? persisted : null);
  } catch {
    return null;
  }
}

function getNavigatorLanguage(): AppLanguage | null {
  const locales = [
    ...(navigator.languages ?? []),
    navigator.language,
  ];

  for (const locale of locales) {
    const detected = normalizeLocaleToLanguage(locale);
    if (detected) return detected;
  }

  return null;
}

export function detectInitialLanguage(): AppLanguage {
  return getPersistedLanguage() ?? getNavigatorLanguage() ?? FALLBACK_LANGUAGE;
}

export async function detectSystemLanguage(): Promise<AppLanguage> {
  const persisted = getPersistedLanguage();
  if (persisted) return persisted;

  try {
    const osLocale = await invoke<string | null>("get_system_locale");
    const osLanguage = normalizeLocaleToLanguage(osLocale);
    if (osLanguage) return osLanguage;
  } catch {
    // no-op: fallback below
  }

  return getNavigatorLanguage() ?? FALLBACK_LANGUAGE;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: detectInitialLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
