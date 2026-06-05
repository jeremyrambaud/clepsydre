import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Apple,
  ArrowRight,
  BarChart3,
  Bookmark,
  Check,
  Globe2,
  Clock,
  Coffee,
  Download,
  Eye,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  Monitor,
  Moon,
  PenLine,
  Search,
  Shuffle,
  SunMoon,
  Terminal,
  Timer,
} from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { ChevronDown, Languages } from 'lucide-react';
import { appName, brand, releaseUrls } from '@/lib/shared';
import {
  defaultLocale,
  getLocaleLabel,
  localizeDocsPath,
  localizePath,
  normalizeLocale,
  supportedLocales,
  type SiteLocale,
} from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import i18next from '@/lib/i18next';

type SupportedPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

function detectPlatform(): SupportedPlatform {
  if (typeof navigator === 'undefined') return 'unknown';

  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('win') || userAgent.includes('windows')) return 'windows';
  if (platform.includes('mac') || userAgent.includes('mac os')) return 'macos';
  if (platform.includes('linux') || userAgent.includes('linux')) return 'linux';
  return 'unknown';
}

const whyCardMeta: Array<{ icon: ReactNode; color: string }> = [
  { icon: <LayoutDashboard key="layout" className="h-7 w-7" />, color: 'emerald' },
  { icon: <Clock key="clock" className="h-7 w-7" />, color: 'sky' },
  { icon: <Eye key="eye" className="h-7 w-7" />, color: 'amber' },
  { icon: <BarChart3 key="bar" className="h-7 w-7" />, color: 'violet' },
];

const featureItemIcons: ReactNode[] = [
  <Timer key="timer" className="h-4 w-4 text-emerald-400" />,
  <Coffee key="coffee" className="h-4 w-4 text-emerald-400" />,
  <PenLine key="pen" className="h-4 w-4 text-emerald-400" />,
  <MessageSquareText key="comment" className="h-4 w-4 text-emerald-400" />,
  <Shuffle key="shuffle" className="h-4 w-4 text-emerald-400" />,
  <Search key="search" className="h-4 w-4 text-emerald-400" />,
  <KeyRound key="key" className="h-4 w-4 text-emerald-400" />,
  <Globe2 key="browser" className="h-4 w-4 text-emerald-400" />,
  <Bookmark key="timeline" className="h-4 w-4 text-emerald-400" />,
  <BarChart3 key="stats" className="h-4 w-4 text-emerald-400" />,
  <History key="history" className="h-4 w-4 text-emerald-400" />,
  <SunMoon key="theme" className="h-4 w-4 text-emerald-400" />,
];

export const Route = createFileRoute('/$lang/')({
  head: ({ params }) => {
    const locale = normalizeLocale(params.lang);
    const t = i18next.getFixedT(locale);

    return {
      meta: [
        {
          title: `${appName} | ${t('landing.meta.title')}`,
        },
        {
          name: 'description',
          content: t('landing.meta.description'),
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const { lang } = Route.useParams();
  const locale = normalizeLocale(lang);

  useEffect(() => {
    if (locale === defaultLocale) {
      window.location.replace(localizePath(defaultLocale));
    }
  }, [locale]);

  if (locale === defaultLocale) return null;

  return <LandingPage locale={locale} />;
}

export function LandingPage({ locale }: { locale: SiteLocale }) {
  const { t, i18n } = useTranslation();
  const [platform, setPlatform] = useState<SupportedPlatform>('unknown');
  const [previewSrc, setPreviewSrc] = useState(
    import.meta.env.VITE_APP_PREVIEW_IMAGE || '/images/app-preview.png',
  );

  useEffect(() => {
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, i18n]);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const whyCards = t('landing.whyCards', { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;
  const featureItems = t('landing.featureItems', { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const primaryDownload = useMemo(() => {
    if (platform === 'windows') return { label: t('landing.platform.windows'), hash: 'windows' };
    if (platform === 'macos') return { label: t('landing.platform.macos'), hash: 'macos' };
    if (platform === 'linux') return { label: t('landing.platform.linux'), hash: 'linux' };
    return { label: t('landing.platform.unknown'), hash: undefined };
  }, [platform, t]);

  const platformCards = [
    {
      title: t('landing.platform.windowsCard'),
      hash: 'windows',
      icon: <Monitor className="h-4 w-4" />,
      isRecommended: platform === 'windows',
    },
    {
      title: t('landing.platform.macosCard'),
      hash: 'macos',
      icon: <Apple className="h-4 w-4" />,
      isRecommended: platform === 'macos',
    },
    {
      title: t('landing.platform.linuxCard'),
      hash: 'linux',
      icon: <Terminal className="h-4 w-4" />,
      isRecommended: platform === 'linux',
    },
  ];

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <div className="landing-topbar-inner">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7 rounded-md" iconClassName="size-5" />
            <span className="text-sm font-semibold tracking-tight text-slate-100">{appName}</span>
          </div>
          <nav className="landing-nav-links">
            <a href="#why">{t('landing.nav.why')}</a>
            <a href="#features">{t('landing.nav.features')}</a>
            <a href={localizeDocsPath(locale)}>{t('landing.nav.docs')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LandingLanguageDropdown locale={locale} />
            <a
              href={`${localizeDocsPath(locale, 'download')}${primaryDownload.hash ? `#${primaryDownload.hash}` : ''}`}
              className="landing-mini-button"
            >
              {t('landing.nav.download')}
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <section className="relative pt-8 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/22 blur-[120px]" />
          <div className="relative mx-auto max-w-3xl space-y-5">
            <span className="landing-pill">{t('landing.hero.pill')}</span>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-6xl">
              {t('landing.hero.titleBefore')}<span className="text-emerald-300">{t('landing.hero.titleHighlight')}</span>{t('landing.hero.titleAfter')}
            </h1>
            <p className="mx-auto max-w-2xl text-pretty text-sm text-slate-300 sm:text-base">
              {t('landing.hero.description')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <a
                href={`${localizeDocsPath(locale, 'download')}${primaryDownload.hash ? `#${primaryDownload.hash}` : ''}`}
                className="landing-primary-button"
              >
                <Download className="h-4 w-4" />
                {primaryDownload.label}
              </a>
              <a href={localizeDocsPath(locale)} className="landing-secondary-button">
                {t('landing.hero.docsButton')}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-xs text-slate-400">
              {(t('landing.hero.badges', { returnObjects: true }) as string[]).map((badge) => (
                <span key={badge} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="landing-preview-frame">
            <img
              src={previewSrc}
              alt="Clepsydre application screenshot"
              className="h-auto w-full object-cover shadow-[0_40px_90px_rgba(2,6,23,0.55)]"
              onError={() => {
                if (previewSrc !== '/images/app-preview-placeholder.svg') {
                  setPreviewSrc('/images/app-preview-placeholder.svg');
                }
              }}
            />
          </div>
        </section>

        <section id="why" className="mt-20 space-y-6">
          <header className="space-y-2 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100">{t('landing.sections.whyTitle')}</h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-300">{t('landing.sections.whyDescription')}</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyCards.map((item, index) => (
              <WhyCard key={item.title} meta={whyCardMeta[index]} title={item.title} description={item.description} />
            ))}
          </div>
        </section>

        <section id="features" className="mt-20 space-y-6">
          <header className="space-y-2 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100">{t('landing.sections.featuresTitle')}</h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-300">{t('landing.sections.featuresDescription')}</p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {featureItems.map((item, index) => (
              <FeatureCard key={item.title} icon={featureItemIcons[index]} title={item.title} description={item.description} />
            ))}
          </div>
        </section>

        <section id="download" className="landing-card mt-20 rounded-2xl border p-6 sm:p-8">
          <div className="space-y-6">
            <header className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100">{t('landing.sections.ctaTitle')}</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-300">{t('landing.sections.ctaDescription')}</p>
            </header>
            <div className="grid gap-3 md:grid-cols-3">
              {platformCards.map((item) => (
                <a
                  key={item.title}
                  href={`${localizeDocsPath(locale, 'download')}#${item.hash}`}
                  className={`landing-platform-card ${item.isRecommended ? 'landing-platform-card-active' : ''}`}
                >
                  <span className="inline-flex items-center gap-2">
                    {item.icon}
                    {item.title}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
              <a href={localizeDocsPath(locale)} className="hover:text-emerald-200">
                {t('landing.links.docs')}
              </a>
              <span>•</span>
              <a href={releaseUrls.latest} target='_blank' className="hover:text-emerald-200">
                {t('landing.links.allReleases')}
              </a>
              <span>•</span>
              <a href={releaseUrls.chrome} target='_blank' className="hover:text-emerald-200">
                {t('landing.links.chrome')}
              </a>
              <span>•</span>
              <a href={releaseUrls.firefox} target='_blank' className="hover:text-emerald-200">
                {t('landing.links.firefox')}
              </a>
            </div>
          </div>
        </section>

        <footer className="mt-14 border-t border-slate-700/55 py-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col items-center gap-2">
              <BrandMark className="h-12 w-12 rounded-xl" iconClassName="size-8" />
              <span className="text-sm font-semibold text-slate-100">{appName}</span>
            </div>
            <FooterColumn
              title={t('landing.footer.product')}
              links={[
                { label: t('landing.footer.why'), href: '#why' },
                { label: t('landing.footer.features'), href: '#features' },
                { label: t('landing.footer.download'), href: '/download' },
              ]}
              locale={locale}
            />
            <FooterColumn
              title={t('landing.footer.resources')}
              links={[
                { label: t('landing.footer.docs'), href: '/docs' },
                { label: t('landing.footer.github'), href: releaseUrls.latest.replace('/releases/latest', '') },
                { label: t('landing.footer.releases'), href: releaseUrls.latest },
              ]}
              locale={locale}
            />
            <FooterColumn
              title={t('landing.footer.extensions')}
              links={[
                { label: t('landing.footer.chrome'), href: releaseUrls.chrome },
                { label: t('landing.footer.firefox'), href: releaseUrls.firefox },
              ]}
              locale={locale}
            />
          </div>
          <p className="mt-6 text-[11px] text-slate-500">
            © {new Date().getFullYear()} {appName}. {t('landing.footer.builtFor')}
          </p>
        </footer>
      </main>
    </div>
  );
}

const whyColorMap: Record<string, { border: string; iconBg: string; iconText: string; gradient: string; hoverBorder: string; hoverShadow: string; accentBar: string }> = {
  emerald: {
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-400/15',
    iconText: 'text-emerald-300',
    gradient: 'bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent',
    hoverBorder: 'hover:border-emerald-400/40',
    hoverShadow: 'hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)]',
    accentBar: 'bg-emerald-400',
  },
  sky: {
    border: 'border-sky-500/20',
    iconBg: 'bg-sky-400/15',
    iconText: 'text-sky-300',
    gradient: 'bg-gradient-to-br from-sky-500/[0.07] via-transparent to-transparent',
    hoverBorder: 'hover:border-sky-400/40',
    hoverShadow: 'hover:shadow-[0_8px_30px_rgba(56,189,248,0.12)]',
    accentBar: 'bg-sky-400',
  },
  amber: {
    border: 'border-amber-500/20',
    iconBg: 'bg-amber-400/15',
    iconText: 'text-amber-300',
    gradient: 'bg-gradient-to-br from-amber-500/[0.07] via-transparent to-transparent',
    hoverBorder: 'hover:border-amber-400/40',
    hoverShadow: 'hover:shadow-[0_8px_30px_rgba(245,158,11,0.12)]',
    accentBar: 'bg-amber-400',
  },
  violet: {
    border: 'border-violet-500/20',
    iconBg: 'bg-violet-400/15',
    iconText: 'text-violet-300',
    gradient: 'bg-gradient-to-br from-violet-500/[0.07] via-transparent to-transparent',
    hoverBorder: 'hover:border-violet-400/40',
    hoverShadow: 'hover:shadow-[0_8px_30px_rgba(139,92,246,0.12)]',
    accentBar: 'bg-violet-400',
  },
};

function WhyCard({ meta, title, description }: { meta: { icon: ReactNode; color: string }; title: string; description: string }) {
  const c = whyColorMap[meta.color] ?? whyColorMap.emerald;
  return (
    <article className={`group relative overflow-hidden rounded-xl border ${c.border} ${c.gradient} p-5 transition-all duration-200 hover:-translate-y-1 ${c.hoverBorder} ${c.hoverShadow}`}>
      <span className={`absolute inset-x-0 top-0 h-[2px] ${c.accentBar} opacity-60 transition-opacity group-hover:opacity-100`} />
      <div className="relative grid justify-items-center gap-3.5 text-center">
        <span className={`${c.iconText}`}>
          {meta.icon}
        </span>
        <h3 className="text-[15px] font-bold leading-snug text-slate-50">{title}</h3>
        <p className="text-[13px] leading-relaxed text-slate-300/80">{description}</p>
      </div>
    </article>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <article className="group grid gap-2 rounded-lg border border-slate-700/30 bg-slate-900/30 p-4 transition hover:border-emerald-500/30 hover:bg-slate-900/50">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
        {icon}
      </span>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="text-xs leading-relaxed text-slate-400">{description}</p>
    </article>
  );
}

function LandingLanguageDropdown({ locale }: { locale: SiteLocale }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (target: SiteLocale) => {
      setOpen(false);
      if (target !== locale) {
        if (target === defaultLocale) {
          window.location.replace(localizePath(target));
        } else {
          void navigate({ to: '/$lang', params: { lang: target }, replace: true });
        }
      }
    },
    [locale, navigate],
  );

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="landing-mini-button inline-flex items-center gap-1.5 px-2.5 cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Languages className="h-3.5 w-3.5" />
        {locale.toUpperCase()}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 min-w-32 overflow-hidden rounded-md border border-slate-700/70 bg-slate-900 py-1 shadow-lg"
        >
          {supportedLocales.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                role="option"
                aria-selected={loc === locale}
                onClick={() => handleSelect(loc)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition cursor-pointer ${
                  loc === locale
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-emerald-200'
                }`}
              >
                {getLocaleLabel(loc)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface FooterColumnProps {
  title: string;
  links: Array<{ label: string; href: string }>;
  locale: SiteLocale;
}

function FooterColumn({ title, links, locale }: FooterColumnProps) {
  return (
    <article className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.href.startsWith('/docs') || link.href === '/download' ? (
              <a
                href={localizeDocsPath(
                  locale,
                  link.href === '/download' ? 'download' : link.href.replace(/^\/docs\/?/, ''),
                )}
                className="text-xs text-slate-400 transition hover:text-emerald-200"
              >
                {link.label}
              </a>
            ) : (
              <a href={link.href} className="text-xs text-slate-400 transition hover:text-emerald-200">
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
