# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Balance** is a mobile-first PWA for busy parents to manage relationships, life areas, and personal goals. It is entirely client-side — no backend, no accounts. Data lives in IndexedDB (via Dexie.js) and devices sync peer-to-peer over WebRTC using QR codes or copy/paste for signalling.

## Build & Development Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Static export to /out (also generates service worker)
npm start                # Serve the static build locally (npx serve out)
npm run lint             # ESLint (src/ only)
npm run format           # Prettier write
npm run format:check     # Prettier check
npm run test             # Run unit + component tests
npm run test:unit        # Unit tests only (*.test.ts, node environment)
npm run test:component   # Component tests only (*.test.tsx, jsdom environment)
npm run test:e2e         # Playwright E2E tests (needs build output in /out)
```

The build step runs `next build` followed by `node scripts/generate-sw.mjs` to produce a Workbox service worker with a precache manifest.

## Static Export & Deployment

The app uses `output: "export"` (fully static, no server). Set `NEXT_PUBLIC_BASE_PATH` for subdirectory hosting (e.g., GitHub Pages). The CI workflow (`.github/workflows/nextjs.yml`) deploys to GitHub Pages on push to `master`, running lint, tests, then building and deploying.

## Architecture

### Tech Stack
- **Next.js 16** with TypeScript, static export, App Router
- **Tailwind CSS v4** with class-based dark mode and CSS custom property design tokens
- **Dexie.js** for IndexedDB (database singleton at `src/lib/db.ts`)
- **WebRTC** for peer-to-peer sync (no server), **lz-string** for SDP compression
- **react-qr-code** + **html5-qrcode** for QR signalling
- **Workbox** (via `scripts/generate-sw.mjs`) for service worker precaching

### Key Directories
- `src/types/models.ts` — All TypeScript interfaces and the `SyncFields` base type
- `src/lib/` — Core business logic (pure functions, no React)
- `src/components/` — React components (all `"use client"`)
- `src/hooks/` — Custom hooks (`useDb`, `useLocation`, `useReminders`)
- `src/app/` — Next.js App Router pages (dashboard, people, life-areas, settings, settings/saved-places, sync, device-transfer)
- `e2e/` — Playwright E2E tests (run against both desktop Chrome and mobile Pixel 5 viewports)
- `src/__tests__/` — Jest unit tests (`.test.ts`) and component tests (`.test.tsx`)

### Core Modules (`src/lib/`)
- **`db.ts`** — Dexie database class (`BalanceDatabase`) with all 11 tables. Singleton `db` export.
- **`priority.ts`** — Extensible scorer registry pattern. Pure functions that take data as arguments (no DB access). Produces `ScoredItem[]` sorted by priority. Contacts with `checkInFrequencyDays <= 0` are skipped.
- **`sync.ts`** — Sync protocol: builds payloads from changed records (using `aboveOrEqual` for timestamp filtering), merges incoming data, handles two-way exchange over WebRTC data channels. Syncs 9 entity types; `UserPreferences` and `SnoozedItem` stay device-local.
- **`merge.ts`** — Entity-agnostic last-write-wins conflict resolution by record `id`. Shared by sync and import/export. **Known limitation:** matching by auto-increment `id` alone can cause data loss when two independently-used devices sync for the first time with overlapping IDs.
- **`peer-connection.ts`** — WebRTC wrapper with SDP compression, data chunking (~16KB limit), connection lifecycle. ICE gathering has a 10s timeout; data channel polling has a 30s timeout. Accepts `iceServers` config (empty array = local network only).
- **`remote-peer-config.ts`** — STUN/TURN configuration factory for cross-network sync.
- **`backup.ts`** — Full data export/import (all 11 entity types, unlike sync which excludes 2). `importReplaceAll` is wrapped in a Dexie transaction for atomicity. Validates entity types against known set.
- **`location.ts`** — Haversine distance, proximity matching against saved places.
- **`constants.ts`** — Tier defaults, check-in frequencies, life area seeds, notification thresholds.
- **`device-id.ts`** — UUID v4 device identifier generation with `crypto.randomUUID()` and fallback.
- **`qr-multicode.ts`** — Split/reassemble data payloads across multiple QR codes (~1,800 bytes per code). Dynamic header size calculation handles 100+ chunks.
- **`register-sw.ts`** — Service worker registration, update detection, and periodic update checks.
- **`reminders.ts`** — On-open reminder system: priority-based OS notifications with cooldowns, welcome-back summaries. Notification icon path respects `NEXT_PUBLIC_BASE_PATH`.
- **`seed.ts`** — Idempotent first-launch database seeding (default preferences, life areas, device ID).

### Data Model
Every entity extends `SyncFields` (`updatedAt`, `deviceId`, `deletedAt`). Soft deletes are used throughout. The `UserPreferences` table uses a string `id` key (not auto-increment). All other tables use `++id` (auto-increment number).

### Theme System
Uses Tailwind `class` strategy with a `ThemeProvider` context. `ThemeScript` injects a synchronous script to prevent flash of wrong theme (reads from localStorage, then confirms from Dexie). Three modes: light, dark, system.

### Layout & Navigation
`RootLayout` → `ThemeProvider` → `ServiceWorkerRegistration` + `UpdatePrompt` + `AppInitializer` → `AppShell` (Header + BottomNav + content).

- **Header:** `fixed top-0 z-50 h-14` with safe-area-top padding
- **BottomNav:** `fixed bottom-0 z-50` with safe-area-bottom padding
- **Main content:** `pt-14 pb-16` to clear both fixed bars, `overflow-y-auto`
- **Bottom-sheet modals** (e.g., quick-log forms on dashboard): `fixed inset-0 z-50`, positioned `items-end` on mobile. Must include `pb-20 sm:pb-4` to clear the BottomNav on mobile.

### P2P Sync Flow
1. Device A creates WebRTC offer → compresses SDP → displays as QR code(s) with a "Copy Code" option
2. Device B scans QR (or pastes the copied code) → creates answer → displays as QR code(s) with a "Copy Code" option
3. Device A scans answer (or pastes the copied code) → data channel opens
4. Both devices exchange sync payloads simultaneously, merge with last-write-wins

The copy/paste alternative allows signalling on devices without cameras (e.g. desktops). The same flow is used for both sync and device transfer.

### Testing

- **Unit tests** (`*.test.ts`): Pure logic, node environment, mock Dexie with `fake-indexeddb`
- **Component tests** (`*.test.tsx`): jsdom environment, React Testing Library, mock DB in `src/__tests__/helpers/mock-db.ts`
- **E2E tests** (`e2e/*.spec.ts`): Playwright against the static build served via `npx serve out`. Runs on both Desktop Chrome and Mobile Chrome (Pixel 5) viewports.
- **Test counts:** 11 unit test files, 10 component test files, 9 E2E spec files. Total: ~359 unit/component tests.

### Path Alias
`@/*` maps to `./src/*` (configured in `tsconfig.json` and mirrored in Jest `moduleNameMapper`).

## Patterns & Conventions

- **Timer cleanup:** Components with `setInterval`/`setTimeout` store IDs in a `useRef` and clear them in an unmount `useEffect`. See `LinkPartnerFlow.tsx` (`waitTimersRef` pattern) and `NotificationPreferences.tsx` (`testTimeoutRef` pattern).
- **Stable callback refs:** When a callback is passed to a third-party library that shouldn't re-initialize when the callback changes, use a ref indirection pattern. See `QRScanner.tsx` (`handleDecodedTextRef`).
- **Navigation safety:** Use `router.push("/path")` instead of `router.back()` to prevent navigating outside the app.
- **useEffect dependencies:** When a Dexie `useLiveQuery` returns an object, extract primitive values before using as effect deps to avoid infinite re-renders. See `settings/page.tsx`.

## Constraints

- **Zero external runtime requests**: No CDN resources, no external fonts, no map APIs, no geocoding. Everything must be bundled and work offline after first visit.
- **No backend**: All data is local (IndexedDB). Sync is peer-to-peer only.
- **PWA offline-first**: Service worker precaches all static assets. Every feature must work with no network.
- **System fonts only**: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **Base path awareness**: Anything that references a static asset path (icons, service worker) must use `process.env.NEXT_PUBLIC_BASE_PATH` for subdirectory deployments.
