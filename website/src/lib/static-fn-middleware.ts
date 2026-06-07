import { defaultSerovalPlugins } from '@tanstack/router-core';
import { fromJSON, toJSONAsync } from 'seroval';
import { withBase } from '@/lib/i18n';

/**
 * Drop-in replacement for `@tanstack/start-static-server-functions`'
 * `staticFunctionMiddleware`.
 *
 * The upstream middleware hardcodes the client fetch URL to
 * `/__tsr/staticServerFnCache/<hash>.json`, which breaks when the site is
 * served under a sub-path (e.g. GitHub Pages `/clepsydre/`): the browser
 * requests `https://host/__tsr/...` instead of `https://host/clepsydre/__tsr/...`
 * and gets the 404 HTML page back (hence "Unexpected token '<'" when parsing
 * JSON).
 *
 * This version keeps the build-time write path relative to the client output
 * directory (unchanged) but prefixes the *client* fetch URL with the
 * deployment base path via {@link withBase}.
 */

async function sha1Hash(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Path of the cache file, relative to the client output root (no base path). */
async function getStaticCachePath(opts: { functionId: string; hash: string }): Promise<string> {
  return `/__tsr/staticServerFnCache/${await sha1Hash(`${opts.functionId}__${opts.hash}`)}.json`;
}

function jsonToFilenameSafeString(json: unknown): string {
  const sortedKeysReplacer = (_key: string, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, curr) => {
            acc[curr] = (value as Record<string, unknown>)[curr];
            return acc;
          }, {})
      : value;
  return JSON.stringify(json ?? '', sortedKeysReplacer)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_');
}

const staticClientCache = typeof document !== 'undefined' ? new Map<string, unknown>() : null;

const serovalPlugins = [...defaultSerovalPlugins];

export const staticFunctionMiddleware = {
  options: {
    type: 'function',
    // biome-ignore lint/suspicious/noExplicitAny: middleware ctx mirrors the upstream JS implementation
    client: async (ctx: any) => {
      if (process.env.NODE_ENV === 'production' && typeof document !== 'undefined') {
        const cachePath = await getStaticCachePath({
          functionId: ctx.serverFnMeta.id,
          hash: jsonToFilenameSafeString(ctx.data),
        });
        const url = withBase(cachePath);

        let response = staticClientCache?.get(url);
        if (!response) {
          response = await fetch(url, { method: 'GET' })
            .then((r) => r.json())
            .then((d) => fromJSON(d, { plugins: serovalPlugins }));
          staticClientCache?.set(url, response);
        }

        if (response) {
          const typed = response as { result: unknown; context: Record<string, unknown> };
          return {
            result: typed.result,
            context: {
              ...ctx.context,
              ...typed.context,
            },
          };
        }
      }
      return ctx.next();
    },
    // biome-ignore lint/suspicious/noExplicitAny: middleware ctx mirrors the upstream JS implementation
    server: async (ctx: any) => {
      const response = await ctx.next();
      if (process.env.NODE_ENV === 'production' && process.env.TSS_CLIENT_OUTPUT_DIR) {
        const [{ default: fs }, { default: path }] = await Promise.all([
          import('node:fs/promises'),
          import('node:path'),
        ]);
        const cachePath = await getStaticCachePath({
          functionId: ctx.serverFnMeta.id,
          hash: jsonToFilenameSafeString(ctx.data),
        });
        const filePath = path.join(process.env.TSS_CLIENT_OUTPUT_DIR, cachePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const stringifiedResult = JSON.stringify(
          await toJSONAsync(
            { result: response.result, context: ctx.sendContext },
            { plugins: serovalPlugins },
          ),
        );
        await fs.writeFile(filePath, stringifiedResult, 'utf-8');
      }
      return response;
    },
  },
} as any;
