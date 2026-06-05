import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import svgr from 'vite-plugin-svgr';

function normalizeBasePath(input?: string) {
  const value = (input || '/').trim();
  if (!value || value === '/') return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(env.VITE_BASE_PATH);
  const isBuild = command === 'build';

  return {
    base,
    server: {
      port: 3000,
    },
    plugins: [
      mdx(),
      svgr(),
      tailwindcss(),
      tanstackStart({
        spa: {
          enabled: isBuild,
          prerender: {
            enabled: isBuild,
            crawlLinks: true,
          },
        },
        pages: [
          {
            path: '/',
          },
          {
            path: '/docs',
          },
          {
            path: '/en',
          },
          {
            path: '/en/docs',
          },
          {
            path: '/api/search',
          },
          {
            path: '/api/download-manifest',
          },
          {
            path: '/llms-full.txt',
          },
          {
            path: '/llms.txt',
          },
        ],
      }),
      react(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
