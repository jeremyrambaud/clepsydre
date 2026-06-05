import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotFound } from '@/components/not-found';

function resolveBasePath() {
  const baseUrl = (import.meta.env.BASE_URL || '/').trim();
  if (!baseUrl || baseUrl === '/') return '/';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    basepath: resolveBasePath(),
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  });
}
