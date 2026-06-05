import { defineI18n } from 'fumadocs-core/i18n';

export const supportedLocales = ['en', 'fr'] as const;
export type SiteLocale = (typeof supportedLocales)[number];

export const defaultLocale: SiteLocale = 'fr';

export const i18n = defineI18n({
  defaultLanguage: defaultLocale,
  languages: [...supportedLocales],
  hideLocale: 'default-locale',
});

export function isSupportedLocale(value: string | undefined | null): value is SiteLocale {
  return value === 'en' || value === 'fr';
}

export function normalizeLocale(value: string | undefined | null): SiteLocale {
  if (!value) return defaultLocale;
  const lower = value.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  return 'fr';
}

export function getLocaleLabel(locale: SiteLocale): string {
  return locale === 'fr' ? 'Français' : 'English';
}

export function localizePath(locale: SiteLocale, path = ''): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!suffix || suffix === '/') return locale === defaultLocale ? '/' : `/${locale}`;
  return locale === defaultLocale ? suffix : `/${locale}${suffix}`;
}

export function localizeDocsPath(locale: SiteLocale, splat = ''): string {
  const clean = splat.replace(/^\/+|\/+$/g, '');
  const docsBase = localizePath(locale, '/docs');
  if (!clean) return docsBase;
  return `${docsBase}/${clean}`;
}

function parseAcceptLanguageHeader(header: string): string[] {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tag, q = 'q=1'] = part.split(';').map((piece) => piece.trim());
      const weightRaw = q.startsWith('q=') ? q.slice(2) : '1';
      const weight = Number.parseFloat(weightRaw);
      return {
        tag: tag.toLowerCase(),
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.tag);
}

export function getPreferredLocaleFromAcceptLanguage(
  headerValue: string | undefined | null,
): SiteLocale {
  if (!headerValue) return defaultLocale;
  const candidates = parseAcceptLanguageHeader(headerValue);
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (isSupportedLocale(locale)) return locale;
  }
  return defaultLocale;
}

export function getPreferredLocaleFromNavigator(): SiteLocale {
  if (typeof navigator === 'undefined') return defaultLocale;

  const candidates = [navigator.language, ...(navigator.languages || [])];
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (isSupportedLocale(locale)) return locale;
  }
  return defaultLocale;
}
