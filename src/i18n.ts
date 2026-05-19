import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import frCloud from "./locales/fr/cloud.json";
import enCloud from "./locales/en/cloud.json";
import frBilling from "./locales/fr/billing.json";
import enBilling from "./locales/en/billing.json";

const SAVED_LANG_KEY = "uiLanguage";

const savedLang = localStorage.getItem(SAVED_LANG_KEY);
// English is the default — only French OS locales get FR out of the box.
const detectedLang = navigator.language?.startsWith("fr") ? "fr" : "en";

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr, cloud: frCloud, billing: frBilling },
    en: { translation: en, cloud: enCloud, billing: enBilling },
  },
  lng: savedLang || detectedLang,
  fallbackLng: "en",
  supportedLngs: ["fr", "en"],
  ns: ["translation", "cloud", "billing"],
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
