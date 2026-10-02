import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import bn from "./bn.json";

export const LANGUAGES = ["bn", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "bn";
export const LANGUAGE_STORAGE_KEY = "compass.language";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, bn: { translation: bn } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
