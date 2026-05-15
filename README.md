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
