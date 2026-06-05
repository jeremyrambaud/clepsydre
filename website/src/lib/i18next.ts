import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import { defaultLocale } from './i18n';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: defaultLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
