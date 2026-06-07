import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Apple,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  Loader2,
  Monitor,
  Puzzle,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { gitConfig, releaseUrls } from '@/lib/shared';

type OsTab = 'windows' | 'macos' | 'linux';

interface ManifestPlatform {
  name: string;
  url: string;
}

interface ReleaseManifest {
  version?: string;
  notes?: string;
  pub_date?: string;
  assets?: ManifestPlatform[];
}

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubReleasePayload {
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets?: GithubReleaseAsset[];
}

async function fetchLatestRelease(signal: AbortSignal): Promise<ReleaseManifest> {
  const response = await fetch(
    `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}/releases/latest`,
    {
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest release (HTTP ${response.status})`);
  }

  const release = (await response.json()) as GithubReleasePayload;
  return {
    version: release.tag_name?.replace(/^v/, ''),
    notes: release.body,
    pub_date: release.published_at,
    assets: (release.assets ?? [])
      .map((asset) => ({
        name: asset.name?.trim() ?? '',
        url: asset.browser_download_url?.trim() ?? '',
      }))
      .filter((asset) => asset.name.length > 0 && asset.url.length > 0),
  };
}

interface PlatformLinks {
  windowsExe?: string;
  windowsMsi?: string;
  macAppleSilicon?: string;
  macIntel?: string;
  linuxAppImage?: string;
  linuxDeb?: string;
  linuxRpm?: string;
}

function normalizeAssetName(asset: ManifestPlatform): string {
  return asset.name.trim().toLowerCase();
}

function isInstallerAsset(asset: ManifestPlatform): boolean {
  const fileName = normalizeAssetName(asset);
  if (!fileName || fileName.endsWith('latest.json')) return false;
  return (
    fileName.endsWith('.exe') ||
    fileName.endsWith('.msi') ||
    fileName.endsWith('.dmg') ||
    fileName.endsWith('.pkg') ||
    fileName.endsWith('.app.tar.gz') ||
    fileName.endsWith('.appimage') ||
    fileName.endsWith('.deb') ||
    fileName.endsWith('.rpm')
  );
}

function pickAssetUrl(
  assets: ManifestPlatform[],
  predicate: (fileName: string) => boolean,
): string | undefined {
  for (const asset of assets) {
    const fileName = normalizeAssetName(asset);
    if (predicate(fileName)) return asset.url;
  }
  return undefined;
}

function resolveLinks(manifest: ReleaseManifest | null): PlatformLinks {
  const installers = (manifest?.assets ?? []).filter(isInstallerAsset);
  return {
    windowsExe: pickAssetUrl(installers, (f) => f.endsWith('.exe')),
    windowsMsi: pickAssetUrl(installers, (f) => f.endsWith('.msi')),
    macAppleSilicon:
      pickAssetUrl(installers, (f) => (f.includes('aarch64') || f.includes('arm64')) && f.endsWith('.dmg')) ??
      pickAssetUrl(installers, (f) => (f.includes('aarch64') || f.includes('arm64')) && f.endsWith('.app.tar.gz')),
    macIntel:
      pickAssetUrl(
        installers,
        (f) => (f.includes('x64') || f.includes('x86_64') || f.includes('amd64')) && f.endsWith('.dmg'),
      ) ??
      pickAssetUrl(
        installers,
        (f) => (f.includes('x64') || f.includes('x86_64') || f.includes('amd64')) && f.endsWith('.app.tar.gz'),
      ),
    linuxAppImage: pickAssetUrl(installers, (f) => f.endsWith('.appimage')),
    linuxDeb: pickAssetUrl(installers, (f) => f.endsWith('.deb')),
    linuxRpm: pickAssetUrl(installers, (f) => f.endsWith('.rpm')),
  };
}

export function DownloadInstallTabs() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [activeTab, setActiveTab] = useState<OsTab>('windows');
  const [release, setRelease] = useState<ReleaseManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tabsId = useId();

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'windows' || hash === 'macos' || hash === 'linux') setActiveTab(hash);
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const data = await fetchLatestRelease(controller.signal);
        setRelease(data);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  const links = useMemo(() => resolveLinks(release), [release]);
  const publishedAt = useMemo(() => {
    if (!release?.pub_date) return null;
    const date = new Date(release.pub_date);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [locale, release?.pub_date]);

  const d = (key: string) => t(`download.${key}`);
  const windowsSteps = t('download.windowsSteps', { returnObjects: true }) as string[];
  const macosSteps = t('download.macosSteps', { returnObjects: true }) as string[];
  const linuxSteps = t('download.linuxSteps', { returnObjects: true }) as string[];

  const tabs: Array<{ id: OsTab; label: string; icon: ReactNode }> = [
    { id: 'windows', label: d('windows'), icon: <Monitor className="h-4 w-4" /> },
    { id: 'macos', label: d('macos'), icon: <Apple className="h-4 w-4" /> },
    { id: 'linux', label: d('linux'), icon: <Terminal className="h-4 w-4" /> },
  ];

  return (
    <section className="space-y-5">
      <div id="windows" className="scroll-mt-24" />
      <div id="macos" className="scroll-mt-24" />
      <div id="linux" className="scroll-mt-24" />

      <div className="flex flex-wrap items-center gap-3">
        {isLoading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-secondary px-3 py-1.5 text-xs text-fd-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
            {d('loading')}
          </span>
        ) : (
          <>
            {release?.version && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                {d('latestStable')}
                <span className="rounded bg-emerald-200/60 px-1.5 py-0.5 font-mono text-[11px] dark:bg-emerald-500/20">
                  v{release.version}
                </span>
              </span>
            )}
            {publishedAt && <span className="text-xs text-fd-muted-foreground">{d('published')} {publishedAt}</span>}
          </>
        )}
        <a
          href={releaseUrls.latest}
          target="_blank"
          rel="noreferrer"
          className="no-underline ml-auto inline-flex items-center gap-1 text-xs text-fd-muted-foreground transition hover:text-emerald-600 dark:hover:text-emerald-300"
        >
          {d('allReleases')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {error && (
        <Callout icon={<AlertTriangle className="h-4 w-4" />} variant="warning">
          {d('manifestError')}{' '}
          <a href={releaseUrls.latest} className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100">
            {d('latestReleasePage')}
          </a>
        </Callout>
      )}

      <Callout icon={<ShieldAlert className="h-4 w-4" />} variant="info" title={d('whyUnsignedTitle')}>
        {d('whyUnsigned')}
      </Callout>

      <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
        <div className="flex border-b border-fd-border" role="tablist" aria-label={d('tabsAriaLabel')}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                id={`${tabsId}-${tab.id}-tab`}
                type="button"
                role="tab"
                aria-controls={`${tabsId}-${tab.id}-panel`}
                aria-selected={selected}
                className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition cursor-pointer ${
                  selected
                    ? 'bg-fd-secondary text-emerald-600 dark:text-emerald-300'
                    : 'text-fd-muted-foreground hover:bg-fd-secondary hover:text-fd-foreground'
                }`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${tab.id}`);
                }}
              >
                {tab.icon}
                {tab.label}
                {selected && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500 dark:bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {activeTab === 'windows' && (
            <article id={`${tabsId}-windows-panel`} role="tabpanel" aria-labelledby={`${tabsId}-windows-tab`} className="space-y-5">
              <DownloadGrid>
                <DownloadCard href={links.windowsExe} label={d('windowsExe')} badge={d('windowsExeDesc')} />
                <DownloadCard href={links.windowsMsi} label={d('windowsMsi')} badge={d('windowsMsiDesc')} />
                {!links.windowsExe && !links.windowsMsi && (
                  <DownloadCard href={releaseUrls.windows} label={d('latestReleasePage')} />
                )}
              </DownloadGrid>

              <StepList steps={windowsSteps} />
              <Callout icon={<Info className="h-4 w-4" />} variant="tip">{d('windowsTip')}</Callout>
            </article>
          )}

          {activeTab === 'macos' && (
            <article id={`${tabsId}-macos-panel`} role="tabpanel" aria-labelledby={`${tabsId}-macos-tab`} className="space-y-5">
              <DownloadGrid>
                <DownloadCard href={links.macAppleSilicon} label={d('macAppleSilicon')} badge={d('macAppleSiliconDesc')} />
                <DownloadCard href={links.macIntel} label={d('macIntel')} badge={d('macIntelDesc')} />
                {!links.macAppleSilicon && !links.macIntel && (
                  <DownloadCard href={releaseUrls.macos} label={d('latestReleasePage')} />
                )}
              </DownloadGrid>

              <StepList steps={macosSteps} commandAfterStep={2} command={d('macosQuarantineCmd')} />

              <Callout icon={<KeyRound className="h-4 w-4" />} variant="info" title={d('macosKeychainTitle')}>
                {d('macosKeychainDesc')}
              </Callout>
            </article>
          )}

          {activeTab === 'linux' && (
            <article id={`${tabsId}-linux-panel`} role="tabpanel" aria-labelledby={`${tabsId}-linux-tab`} className="space-y-5">
              <DownloadGrid>
                <DownloadCard href={links.linuxAppImage} label={d('linuxAppImage')} badge={d('linuxAppImageDesc')} />
                <DownloadCard href={links.linuxDeb} label={d('linuxDeb')} badge={d('linuxDebDesc')} />
                <DownloadCard href={links.linuxRpm} label={d('linuxRpm')} badge={d('linuxRpmDesc')} />
                {!links.linuxAppImage && !links.linuxDeb && !links.linuxRpm && (
                  <DownloadCard href={releaseUrls.linux} label={d('latestReleasePage')} />
                )}
              </DownloadGrid>

              <p className="text-sm leading-relaxed text-fd-muted-foreground">{d('linuxIntro')}</p>

              <StepList steps={linuxSteps} />

              <div className="space-y-4">
                <CommandBlock title={d('linuxAppImageTitle')} description={d('linuxAppImageInstructions')} command={`chmod +x Clepsydre_*.AppImage\n./Clepsydre_*.AppImage`} />
                <CommandBlock title={d('linuxDebTitle')} description={d('linuxDebInstructions')} command="sudo apt install ./Clepsydre_*.deb" />
                <CommandBlock title={d('linuxRpmTitle')} description={d('linuxRpmInstructions')} command="sudo rpm -i Clepsydre-*.rpm" />
              </div>

              <Callout icon={<Info className="h-4 w-4" />} variant="tip" title="WebKitGTK">
                <span dangerouslySetInnerHTML={{ __html: d('linuxWebkitNote') }} />
                <div className="mt-3 space-y-2">
                  <pre className="overflow-x-auto rounded-md border border-fd-border bg-fd-background px-4 py-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                    <code className="bg-inherit border-0"><span className="text-fd-muted-foreground"># Debian / Ubuntu</span>{'\n'}{d('linuxWebkitCmdDebian')}</code>
                  </pre>
                  <pre className="overflow-x-auto rounded-md border border-fd-border bg-fd-background px-4 py-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                    <code className="bg-inherit border-0"><span className="text-fd-muted-foreground"># Fedora</span>{'\n'}{d('linuxWebkitCmdFedora')}</code>
                  </pre>
                </div>
              </Callout>
            </article>
          )}
        </div>
      </div>

      {/* Browser extensions */}
      <div className="rounded-xl border border-fd-border bg-fd-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
            <Puzzle className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-fd-foreground mb-0 mt-0">{d('extensionsTitle')}</h3>
            <p className="text-xs text-fd-muted-foreground mt-0 mb-0">{d('extensionsDescription')}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={releaseUrls.chrome}
            target="_blank"
            rel="noreferrer"
            className="no-underline group flex items-center gap-3 rounded-lg border border-fd-border bg-fd-secondary/50 px-4 py-3 transition hover:border-violet-400/60 hover:bg-violet-50/50 dark:hover:border-violet-500/50 dark:hover:bg-violet-500/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600 transition group-hover:bg-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:group-hover:bg-violet-500/20">
              <Globe className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-4">
              <span className="block text-sm font-medium text-fd-foreground">{d('extensionChrome')}</span>
              <span className="text-[11px] text-fd-muted-foreground">{d('extensionChromeDesc')}</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground/50 transition group-hover:text-violet-500" />
          </a>
          <a
            href={releaseUrls.firefox}
            target="_blank"
            rel="noreferrer"
            className="no-underline group flex items-center gap-3 rounded-lg border border-fd-border bg-fd-secondary/50 px-4 py-3 transition hover:border-violet-400/60 hover:bg-violet-50/50 dark:hover:border-violet-500/50 dark:hover:bg-violet-500/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600 transition group-hover:bg-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:group-hover:bg-violet-500/20">
              <Globe className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-4">
              <span className="block text-sm font-medium text-fd-foreground">{d('extensionFirefox')}</span>
              <span className="text-[11px] text-fd-muted-foreground">{d('extensionFirefoxDesc')}</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground/50 transition group-hover:text-violet-500" />
          </a>
        </div>

        <div className="flex items-center gap-2 text-xs text-fd-muted-foreground">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          {d('extensionsNoConfig')}
        </div>
      </div>
    </section>
  );
}

function DownloadGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function DownloadCard({ href, label, badge }: { href?: string; label: string; badge?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="no-underline group flex items-center gap-3 rounded-lg border border-fd-border bg-fd-secondary/50 px-4 py-3 transition hover:border-emerald-400/60 hover:bg-emerald-50/50 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:group-hover:bg-emerald-500/20">
        <Download className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 leading-4">
        <span className="block text-sm font-medium text-fd-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-200">{label}</span>
        {badge && <span className="text-[11px] text-fd-muted-foreground">{badge}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fd-muted-foreground/50 transition group-hover:text-emerald-500 dark:group-hover:text-emerald-400" />
    </a>
  );
}

function StepList({
  steps,
  commandAfterStep,
  command,
}: {
  steps: string[];
  commandAfterStep?: number;
  command?: string;
}) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={step}>
          <div className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {i + 1}
            </span>
            <p
              className="mb-0 mt-0 pt-0.5 text-sm leading-relaxed text-fd-foreground"
              dangerouslySetInnerHTML={{ __html: step }}
            />
          </div>
          {commandAfterStep !== undefined && command && i === commandAfterStep && (
            <div className="ml-9 mt-2">
              <pre className="overflow-x-auto rounded-md border border-fd-border bg-fd-background px-4 py-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                <code className="bg-inherit border-0">{command}</code>
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CommandBlock({ title, description, command }: { title: string; description?: string; command: string }) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-secondary/50 p-4">
      <p className="mb-1 mt-0 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground">{title}</p>
      {description && <p className="mb-3 mt-0 text-sm text-fd-muted-foreground">{description}</p>}
      <pre className="overflow-x-auto rounded-md border border-fd-border bg-fd-background px-4 py-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
        <code className="bg-inherit border-0">{command}</code>
      </pre>
    </div>
  );
}

function Callout({
  icon,
  variant,
  title,
  children,
}: {
  icon: ReactNode;
  variant: 'warning' | 'info' | 'tip';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    warning:
      'border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-200',
    info:
      'border-fd-border bg-fd-card text-fd-card-foreground',
    tip:
      'border-emerald-300/50 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200',
  };
  const iconStyles = {
    warning: 'text-amber-500 dark:text-amber-400',
    info: 'text-fd-muted-foreground',
    tip: 'text-emerald-500 dark:text-emerald-400',
  };

  return (
    <div className={`flex gap-3 rounded-lg border p-4 ${styles[variant]}`}>
      <span className={`mt-0.5 shrink-0 ${iconStyles[variant]}`}>{icon}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="mb-1 mt-0 font-semibold">{title}</p>}
        {typeof children === 'string' ? (
          <p className="mb-0 mt-0" dangerouslySetInnerHTML={{ __html: children }} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
