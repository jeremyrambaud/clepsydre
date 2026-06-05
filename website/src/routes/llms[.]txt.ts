import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      async GET() {
        const [{ source }, { llms }] = await Promise.all([
          import('@/lib/source'),
          import('fumadocs-core/source'),
        ]);
        return new Response(llms(source).index());
      },
    },
  },
});
