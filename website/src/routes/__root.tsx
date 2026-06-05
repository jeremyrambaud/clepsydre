import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import * as React from 'react';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import SearchDialog from '@/components/search';
import { appName, brand, gitConfig } from '@/lib/shared';
import { getI18nProvider } from '@/lib/layout.shared';
import { defaultLocale, localizePath, normalizeLocale, type SiteLocale } from '@/lib/i18n';
import i18next from '@/lib/i18next';

const rootT = i18next.getFixedT(defaultLocale);

export const Route = createRootRoute({
  head: () => {
    const title = `${appName} | ${rootT('meta.title')}`;
    const description = rootT('meta.description');
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${gitConfig.user}.github.io/${gitConfig.repo}/` },
      ],
      links: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'stylesheet', href: appCss },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap',
        },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  const { lang } = useParams({ strict: false });
  const locale = normalizeLocale(lang);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (i18next.language !== locale) {
      void i18next.changeLanguage(locale);
    }
  }, [locale]);

  const i18nProviderValue = React.useMemo(() => {
    const base = getI18nProvider(locale);
    return {
      ...base,
      onLocaleChange: (newLocale: string) => {
        const target = normalizeLocale(newLocale) as SiteLocale;
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

        const docsMatch =
          currentPath.match(/^\/en\/docs\/?(.*)$/) || currentPath.match(/^\/docs\/?(.*)$/);
        if (docsMatch) {
          const splat = docsMatch[1] || '';
          if (target === defaultLocale) {
            void navigate({
              to: '/docs/$',
              params: { _splat: splat },
              replace: true,
            });
          } else {
            void navigate({
              to: '/$lang/docs/$',
              params: { lang: target, _splat: splat },
              replace: true,
            });
          }
        } else {
          if (target === defaultLocale) {
            window.location.replace(localizePath(defaultLocale));
          } else {
            void navigate({
              to: '/$lang',
              params: { lang: target },
              replace: true,
            });
          }
        }
      },
    };
  }, [locale, navigate]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ SearchDialog }} i18n={i18nProviderValue}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
