import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, docsRoute, gitConfig } from './shared';
import { BrandMark } from '@/components/brand-mark';
import { uiTranslations, i18nProvider } from 'fumadocs-ui/i18n';
import { i18n, localizePath, normalizeLocale, type SiteLocale } from './i18n';
import i18next from './i18next';

const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add('ui', {
    en: i18next.getResourceBundle('en', 'translation')?.fumadocs ?? {},
    fr: i18next.getResourceBundle('fr', 'translation')?.fumadocs ?? {},
  });

export function getI18nProvider(locale: SiteLocale) {
  return i18nProvider(translations, locale);
}

export function baseOptions(localeInput?: string): BaseLayoutProps {
  const locale = normalizeLocale(localeInput);
  const t = i18next.getFixedT(locale);

  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2">
          <BrandMark className="h-7 w-7 rounded-md" iconClassName="size-5" />
          <span className="font-semibold tracking-tight">{appName}</span>
        </span>
      ),
    },
    links: [],
    i18n,
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
