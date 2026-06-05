export const appName = 'Clepsydre';
export const docsRoute = '/docs';
export const docsDownloadRoute = `${docsRoute}/download`;
export const docsImageRoute = '/og/docs';
export const latestManifestUrl =
  'https://github.com/jeremyrambaud/clepsydre/releases/latest/download/latest.json';

export const gitConfig = {
  user: 'jeremyrambaud',
  repo: 'clepsydre',
  branch: 'main',
};

export const brand = {
  tagline: 'Desktop-native Redmine time tracking',
  description:
    'A high-performance desktop companion for Redmine time tracking, entry management, and workload analysis.',
};

export const releaseUrls = {
  latest: `https://github.com/${gitConfig.user}/${gitConfig.repo}/releases`,
  windows:
    import.meta.env.VITE_DOWNLOAD_URL_WINDOWS ||
    `https://github.com/${gitConfig.user}/${gitConfig.repo}/releases/latest`,
  macos:
    import.meta.env.VITE_DOWNLOAD_URL_MACOS ||
    `https://github.com/${gitConfig.user}/${gitConfig.repo}/releases/latest`,
  linux:
    import.meta.env.VITE_DOWNLOAD_URL_LINUX ||
    `https://github.com/${gitConfig.user}/${gitConfig.repo}/releases/latest`,
  chrome:
    'https://chromewebstore.google.com/detail/clepsydre-companion-%E2%80%94-red/ilojdkpijdgehbjjhlbljekgeoomijhp',
  firefox: 'https://addons.mozilla.org/fr/firefox/addon/clepsydre-companion/',
};
