import { createFileRoute, notFound } from '@tanstack/react-router';
import { markdownPathToSlugs } from '@/lib/docs-path';
import { defaultLocale, normalizeLocale } from '@/lib/i18n';

export const Route = createFileRoute('/$lang/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getLLMText, source } = await import('@/lib/source');
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? []);
        const locale = normalizeLocale(params.lang);
        if (locale === defaultLocale) {
          const markdownPath = slugs.length > 0 ? `${slugs.join('/')}.md` : 'index.md';
          return Response.redirect(`/docs/${markdownPath}`, 302);
        }
        const page = source.getPage(slugs, locale);
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
