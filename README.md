# Clepsydre

Desktop application for Redmine time tracking, built with Tauri v2, React, TypeScript, and Tailwind CSS.

## Prerequisites

- [Rust](https://rustup.rs/) (1.77.2+)
- [Bun](https://bun.sh/)
- Platform-specific dependencies for Tauri: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
bun install
```

## Development

```bash
bun run tauri dev
```

## Build

```bash
bun run tauri build
```

## Browser Extension Bridge

The packaged Chrome and Firefox extensions connect directly to the local Clepsydre bridge endpoint at `http://127.0.0.1:23847/integration`.

No manual native host installation command is required on macOS, Linux, or Windows.

## Browser Store Auto-Publish

On stable tag releases (`vX.Y.Z`), GitHub Actions can automatically publish extension updates to Chrome Web Store and Firefox Add-ons.

Required GitHub repository secrets:

- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`
- `FIREFOX_ADDON_SLUG`
- `FIREFOX_API_KEY`
- `FIREFOX_API_SECRET`

Notes:

- Chrome credentials come from your Google Cloud OAuth client + Chrome Web Store API setup.
- Firefox credentials come from AMO API credentials for the target add-on.
- Beta tags are not pushed to browser stores by default.

## Beta Release Trigger

Semantic-release is automatic only on `main`.

For `beta`, release creation is manual:

1. Open GitHub Actions.
2. Run the `Semantic Release` workflow.
3. Select the `beta` branch in the branch picker before running.

No beta version is created automatically on push.

## Project Structure

```
src/                    Frontend (React + TypeScript)
  components/           Reusable UI components
  hooks/                Custom React hooks
  store/                Zustand state management
  types/                TypeScript interfaces (Redmine, settings)
src-tauri/              Backend (Rust + Tauri v2)
  src/
    lib.rs              App entry point, plugin registration
    commands/           Tauri commands (keyring, idle detection)
    migrations.rs       SQLite schema migrations
```

## Stack

- **Runtime**: Tauri v2 (Rust backend + webview frontend)
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4
- **State**: Zustand
- **Icons**: Lucide React
- **Database**: SQLite (via tauri-plugin-sql)
- **Secrets**: OS keychain (via tauri-plugin-keyring)
- **Platforms**: macOS, Windows, Linux
