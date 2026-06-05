import { createFileRoute, notFound } from '@tanstack/react-router';
import { markdownPathToSlugs } from '@/lib/docs-path';
import { defaultLocale } from '@/lib/i18n';

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getLLMText, source } = await import('@/lib/source');
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? []);
        const page = source.getPage(slugs, defaultLocale);
        if (!page) throw notFound();

        return new Response(await getLLMText(page), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });
      },
    },
  },
});
