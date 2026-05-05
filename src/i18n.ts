import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import frCloud from "./locales/fr/cloud.json";
import enCloud from "./locales/en/cloud.json";

const SAVED_LANG_KEY = "uiLanguage";

const savedLang = localStorage.getItem(SAVED_LANG_KEY);
const detectedLang = navigator.language.startsWith("en") ? "en" : "fr";

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr, cloud: frCloud },
    en: { translation: en, cloud: enCloud },
  },
  lng: savedLang || detectedLang,
  fallbackLng: "fr",
  supportedLngs: ["fr", "en"],
  ns: ["translation", "cloud"],
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

export function changeLanguage(lang: string) {
  localStorage.setItem(SAVED_LANG_KEY, lang);
  return i18n.changeLanguage(lang);
}
