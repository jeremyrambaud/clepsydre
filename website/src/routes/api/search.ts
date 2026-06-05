import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async () => {
        const [{ source }, { createFromSource }] = await Promise.all([
          import('@/lib/source'),
          import('fumadocs-core/search/server'),
        ]);
        return createFromSource(source).staticGET();
      },
    },
  },
});
