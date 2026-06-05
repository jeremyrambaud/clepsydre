import { createFileRoute, Link, notFound, useLocation } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { createServerFn } from '@tanstack/react-start';
import { markdownPathToSlugs } from '@/lib/docs-path';
import browserCollections from 'collections/browser';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { baseOptions } from '@/lib/layout.shared';
import { gitConfig } from '@/lib/shared';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { Suspense, useEffect } from 'react';
import { useMDXComponents } from '@/components/mdx';
import { defaultLocale, localizeDocsPath, normalizeLocale, withBase } from '@/lib/i18n';

export const Route = createFileRoute('/$lang/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = markdownPathToSlugs(params._splat?.split('/') ?? []);
    const lang = normalizeLocale(params.lang);
    const data = await loader({
      data: {
        slugs,
        lang,
      },
    });
    await clientLoader.preload(data.path);
    return data;
  },
});

const loader = createServerFn({
  method: 'GET',
})
  .inputValidator((input: { slugs: string[]; lang: string }) => input)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data }) => {
    const { slugsToMarkdownPathByLocale, source } = await import('@/lib/source');
    const locale = normalizeLocale(data.lang);
    const page = source.getPage(data.slugs, locale);
    if (!page) throw notFound();

    return {
      path: page.path,
      markdownUrl: slugsToMarkdownPathByLocale(page.slugs, locale).url,
      pageTree: await source.serializePageTree(source.getPageTree(locale)),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    {
      markdownUrl,
      path,
    }: {
      markdownUrl: string;
      path: string;
    },
  ) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/website/content/docs/${path}`}
          />
        </div>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { lang, _splat } = Route.useParams();
  const locale = normalizeLocale(lang);
  const { pageTree, path, markdownUrl } = useFumadocsLoader(Route.useLoaderData());
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (locale === defaultLocale) {
      window.location.replace(withBase(`${localizeDocsPath(defaultLocale, _splat ?? '')}${hash || ''}`));
    }
  }, [hash, locale, _splat]);

  if (locale === defaultLocale) return null;

  return (
    <DocsLayout {...baseOptions(locale)} tree={pageTree}>
      <Link to={markdownUrl} hidden />
      <Suspense>{clientLoader.useContent(path, { markdownUrl, path })}</Suspense>
    </DocsLayout>
  );
}
