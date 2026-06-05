import { createFileRoute } from '@tanstack/react-router';
import { gitConfig } from '@/lib/shared';

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

export const Route = createFileRoute('/api/download-manifest')({
  server: {
    handlers: {
      GET: async () => {
        const response = await fetch(
          `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}/releases/latest`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'clepsydre-website',
            },
          },
        );

        if (!response.ok) {
          return new Response(
            JSON.stringify({
              error: true,
              message: `Failed to fetch latest release (${response.status})`,
            }),
            {
              status: 502,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
        }

        const release = (await response.json()) as GithubReleasePayload;
        const payload = {
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

        return new Response(JSON.stringify(payload), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
          },
        });
      },
    },
  },
});
