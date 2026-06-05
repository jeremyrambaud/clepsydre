import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docs } from 'collections/server';
import { docsRoute } from './shared';
import { defaultLocale, i18n, localizeDocsPath, normalizeLocale, type SiteLocale } from './i18n';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  i18n,
  url: (slugs, locale) => {
    const lang = normalizeLocale(locale);
    return localizeDocsPath(lang, slugs.join('/'));
  },
  plugins: [lucideIconsPlugin()],
});

export function markdownPathToSlugs(segs: string[]) {
  if (segs.length === 0) return [];

  const out = [...segs];
  out[out.length - 1] = out[out.length - 1].replace(/\.md$/, '');
  if (out.length === 1 && out[0] === 'index') out.pop();
  return out;
}

export function slugsToMarkdownPath(slugs: string[]) {
  return slugsToMarkdownPathByLocale(slugs, defaultLocale);
}

export function slugsToMarkdownPathByLocale(slugs: string[], locale: SiteLocale) {
  const segments = [...slugs];
  if (segments.length === 0) {
    segments.push('index.md');
  } else {
    segments[segments.length - 1] += '.md';
  }

  return {
    segments,
    url:
      locale === defaultLocale
        ? `${docsRoute}/${segments.join('/')}`
        : `/${locale}${docsRoute}/${segments.join('/')}`,
  };
}

export function getPageMarkdownUrl(slugs: string[]) {
  return getPageMarkdownUrlByLocale(slugs, defaultLocale);
}

export function getPageMarkdownUrlByLocale(slugs: string[], locale: SiteLocale) {
  const segments = [...slugs];
  if (segments.length === 0) {
    segments.push('index.md');
  } else {
    segments[segments.length - 1] += '.md';
  }

  return {
    segments,
    url:
      locale === defaultLocale
        ? `${docsRoute}/${segments.join('/')}`
        : `/${locale}${docsRoute}/${segments.join('/')}`,
  };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}
