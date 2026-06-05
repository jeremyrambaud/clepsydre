# Clepsydre Website

Marketing site + documentation built with **TanStack Start** and **Fumadocs**.

## Local development

```bash
bun install
bun run dev
```

## Build static output

```bash
bun run build
```

The static output is generated in `dist/client`.

## GitHub Pages deployment

The repository includes a workflow that deploys this site to GitHub Pages.

By default, the workflow computes the base path automatically:

- `"/"` for `username.github.io` repositories
- `"/<repo>/"` for project pages

You can override this with a repository variable:

- `GH_PAGES_BASE_PATH` (example: `/clepsydre/`)

## Optional OS-specific direct downloads

The landing page can use direct asset links per OS with these environment variables:

- `VITE_DOWNLOAD_URL_WINDOWS`
- `VITE_DOWNLOAD_URL_MACOS`
- `VITE_DOWNLOAD_URL_LINUX`

If they are not provided, download buttons point to the latest GitHub release page.

## App screenshot on homepage

Homepage preview image is loaded from:

- `VITE_APP_PREVIEW_IMAGE` (if defined), or
- `public/images/app-preview.png` (default path)

If no image is found, a built-in placeholder is shown.
