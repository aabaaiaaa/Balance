# Project Requirements

## Metadata
- **Project**: Balance
- **Created**: 2026-02-16
- **Author**: Developer

## Overview

**Balance** is a mobile-first web app for busy parents who are stretched thin across work, parenting, relationships, and personal needs. It helps you stay intentionally connected with the people who matter, take care of yourself, and make the most of whatever free time appears — without needing the mental bandwidth to think about it all holistically.

### Key Concepts

- **Relationship tiers**: People organised into circles (partner, close family, extended family, close friends, wider friends) with different expected check-in frequencies
- **Life areas**: Categories that need balancing — self-care, DIY/household, partner time, social life, personal goals
- **Priority dashboard**: An always-up-to-date view of what needs attention most, across all areas
- **"I have free time" mode**: Tell it how long you have and it suggests the best use of that time based on what's most overdue and what will bring you back into balance
- **Partner sharing**: Both partners use the app on their own devices and sync data between them
- **Zero infrastructure**: All data lives locally in the browser (IndexedDB). No server, no database, no accounts. Devices sync directly via WebRTC peer-to-peer data channels — QR codes are used only for the initial signalling handshake, then data flows freely over the direct connection with no size limits.

### Tech Stack
- **Frontend**: Next.js with TypeScript, mobile-first responsive design, PWA
- **Local storage**: Dexie.js (IndexedDB wrapper)
- **QR codes**: `react-qr-code` for generation, `html5-qrcode` for camera scanning (used for WebRTC signalling only)
- **Peer-to-peer**: WebRTC Data Channel for device-to-device data transfer
- **Compression**: `lz-string` or similar for compressing SDP signalling data to fit in QR codes
- **No backend**: Entirely client-side. No server, no cloud database, no authentication. No internet connection required for local network sync.

### Peer-to-Peer Sync Architecture

Devices connect directly using WebRTC, with QR codes used only for the initial signalling handshake. There are two connectivity modes:

#### Local Network (default — no internet required)

When both devices are on the same Wi-Fi or local network, WebRTC connects using **host ICE candidates** only (the devices' local IP addresses). No STUN or TURN servers are needed — the connection is entirely local. This is the primary mode and must work offline.

1. **Device A** creates a WebRTC peer connection (with no ICE servers configured), generates an SDP offer, compresses it, and displays it as a QR code
2. **Device B** scans the QR code, creates its own peer connection, generates an SDP answer, and displays it as a QR code
3. **Device A** scans the answer. The peer-to-peer data channel opens over the local network
4. **Both devices** exchange sync data over the data channel. Data is serialised as JSON and streamed in chunks
5. **Both devices** merge incoming data using last-write-wins conflict resolution. A progress indicator shows transfer status
6. **Connection closes** when sync is complete. Both devices record the sync timestamp

#### Remote Network (optional extension — requires internet)

When devices are on different networks (e.g., syncing with a partner who's away), the app can optionally use public STUN servers to discover external addresses and traverse NATs. This mode is kept as a separate code path from the local network offering:

- Uses a configurable STUN server (e.g., `stun:stun.l.google.com:19302`) to gather server-reflexive ICE candidates
- Falls back gracefully if the STUN server is unreachable (the connection attempt simply fails with a clear message, rather than blocking local-mode functionality)
- May not work behind symmetric NATs without a TURN relay — the UI should communicate this limitation clearly if connection fails
- The signalling flow (QR code exchange) is identical; only the ICE server configuration differs

This approach has no data size limitations — the QR codes only carry the small signalling payload (~1-2KB compressed), while the actual app data flows freely over the WebRTC data channel. This makes it suitable for full dataset transfers (device migration, setting up a partner's app) as well as lightweight delta syncs.

---

## Tasks

### TASK-001: Initialise Next.js project with TypeScript and PWA configuration
- **Status**: done
- **Priority**: high
- **Dependencies**: none
- **Description**: Create a new Next.js project with TypeScript. Configure for **static export** (`output: 'export'` in `next.config.js`) so it generates a fully static site with an `index.html` at the root, suitable for GitHub Pages hosting. Configure `basePath` to support deployment to a subdirectory (e.g., `/Balance/`) via an environment variable so it works both locally and on GitHub Pages. Configure it as a Progressive Web App with a service worker using a **precache-first strategy** — all static assets (JS bundles, CSS, HTML pages, fonts, icons, images) must be listed in a precache manifest and cached on service worker install, so the entire app works offline after the first visit. Use a build tool like `next-pwa` or Workbox to generate the precache manifest automatically at build time. **Do not use any external CDN resources** — no Google Fonts, no remotely-hosted CSS or JS. Use system fonts (e.g., `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) or self-host font files bundled with the app. Add a mobile-friendly viewport meta tag and web app manifest. Set up the basic folder structure (components, lib, hooks, types). Add Tailwind CSS for styling. Set up **ESLint** (with the Next.js recommended config) and **Prettier** for consistent code formatting. Set up **testing infrastructure**: Jest (with `ts-jest` for TypeScript) for unit tests, React Testing Library for component tests, and Playwright for end-to-end tests. Configure Jest to work with Next.js (module aliases, JSX transform). Add npm scripts for `lint`, `format`, `test` (unit + component), `test:unit`, `test:component`, and `test:e2e`. Ensure `next export` produces a clean `/out` directory with `index.html` at the root.

### TASK-002: Set up mobile-first responsive layout shell
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-001
- **Description**: Build the app's layout skeleton: a bottom navigation bar (Dashboard, People, Life Areas, Settings), a top header with the app name, and a scrollable main content area. Use a mobile-first design that works well on phones but is usable on desktop. Create placeholder pages for each nav tab.

### TASK-003: Set up local database layer with Dexie.js
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-001
- **Description**: Install and configure Dexie.js as the IndexedDB wrapper. Define the database with versioning support. Create a database service module that all components will use to read/write data. Include basic error handling and a hook (e.g., `useDb`) for React components to access the database.

### TASK-004: Define core data models and database schema
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-003
- **Description**: Create TypeScript interfaces and Dexie table definitions for all core entities: `Contact` (id, name, tier, checkInFrequencyDays, lastCheckIn, notes, phoneNumber, location: { lat, lng, label }), `CheckIn` (id, contactId, date, type, notes, location: { lat, lng }), `LifeArea` (id, name, icon, targetHoursPerWeek), `Activity` (id, lifeAreaId, description, durationMinutes, date, notes, location: { lat, lng }), `HouseholdTask` (id, lifeAreaId, title, estimatedMinutes, priority: high/medium/low, status: pending/in-progress/done, completedAt?), `Goal` (id, lifeAreaId, title, description, targetDate?, milestones: { title, done }[], progressPercent), `DateNight` (id, date, notes, ideaUsed?), `DateNightIdea` (id, title), `SavedPlace` (id, label, lat, lng, radius, linkedContactIds: string[], linkedLifeAreaIds: string[], lastVisited?: timestamp, visitCount: number) — a place can be linked to multiple contacts AND multiple life areas simultaneously (e.g., a friend's house is both their contact location and a "Social" spot), `SnoozedItem` (id, itemType: "contact" | "task" | "goal", itemId, snoozedUntil: timestamp), `UserPreferences` (settings, onboardingComplete, deviceId, householdId, partnerDeviceId, lastSyncTimestamp, weekStartDay: "monday" | "sunday" — defaults to "monday", dateNightFrequencyDays: number — defaults to 14, theme: "light" | "dark" | "system" — defaults to "system"). Every entity must include `updatedAt` (timestamp), `deviceId` (which device created/modified it), and `deletedAt` (nullable, for soft deletes) to support sync. Add seed data for default life areas (Self-care, DIY/Household, Partner Time, Social, Personal Goals). Generate a unique `deviceId` on first launch and store it in preferences. Define default check-in frequencies per tier as constants: Partner = 1 day, Close Family = 7 days, Extended Family = 21 days, Close Friends = 14 days, Wider Friends = 30 days (users can override these per contact).

### TASK-005: Build add/edit contact form with tier assignment
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-002, TASK-004
- **Description**: Create a form to add a new contact: name, relationship tier (dropdown: Partner, Close Family, Extended Family, Close Friends, Wider Friends), desired check-in frequency (e.g., every X days), optional phone number, and optional notes. When a tier is selected, auto-populate the check-in frequency with the tier's default value (from TASK-004 constants) — the user can then adjust it if needed. The same form should work for editing existing contacts. Include a delete option with confirmation (soft delete — sets `deletedAt`). Save to local database via Dexie.

### TASK-006: Build contacts list view with tier grouping and overdue indicators
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-005
- **Description**: Create the People tab view showing all contacts grouped by tier. Each contact card shows: name, tier badge, days since last check-in, and a colour-coded overdue indicator (green = recent, amber = due soon, red = overdue based on their frequency). Tapping a contact opens their detail/edit view. Include a floating action button to add new contacts.

### TASK-007: Build check-in logging UI
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-006
- **Description**: From a contact's detail view, add a "Log check-in" button that opens a quick-entry form: check-in type (called, texted, met up, video call, other), optional notes, and date (defaults to now). Saving a check-in updates the contact's lastCheckIn date. Show a recent check-in history list on the contact detail view (last 10 check-ins with type, date, and notes).

### TASK-008: Build life area configuration screen
- **Status**: done
- **Priority**: medium
- **Dependencies**: TASK-002, TASK-004
- **Description**: Create the Life Areas tab showing all life areas as cards. Each card displays: area name, icon, target hours per week, and hours logged this week (with a simple progress bar). Allow users to edit the target hours per week for each area. Allow adding custom life areas and editing/deleting non-default ones. Pre-populate with the five default areas on first launch.

### TASK-009: Build activity logging within life areas
- **Status**: done
- **Priority**: medium
- **Dependencies**: TASK-008
- **Description**: Tapping a life area card opens its detail view. Add a "Log activity" button: description (free text), duration in minutes, date (defaults to now), optional notes. Show a history of recent activities for that area (last 20). Include a weekly summary showing total time spent this week vs. the target. "This week" is calculated using the `weekStartDay` preference from UserPreferences (defaults to Monday).

### TASK-010: Build life area balance visualisation
- **Status**: done
- **Priority**: medium
- **Dependencies**: TASK-009
- **Description**: On the Life Areas tab, add a visual balance overview at the top: a simple bar chart or radar/spider chart showing time spent vs. target across all areas for the current week. Highlight areas that are significantly under their target. Use a lightweight chart library (e.g., Recharts) or simple CSS-based bars to keep bundle size small. Whichever approach is used, it must be fully bundled at build time with no runtime fetches of external assets — the visualisation must work offline.

### TASK-011: Implement priority scoring algorithm
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-007, TASK-009
- **Description**: Create a scoring module that calculates a priority score for every actionable item (contacts to check in with, life area activities to do, household tasks, goals). Factors: how overdue something is (days past target / target frequency), the relationship tier weight (partner > close family > friends), life area imbalance (areas furthest below target score higher), user-set priority on household tasks, and goal target dates approaching. The algorithm must be **extensible by item type** — design it with a scorer interface/registry pattern so new item types (household tasks from TASK-015, goals from TASK-016, date nights from TASK-029) can register their own scoring logic without modifying the core algorithm. **Partner-aware scoring**: when a `partnerDeviceId` is set in preferences, the algorithm should check if any check-ins or activities were logged by the partner's device (identified by `deviceId` on records) within the current scoring window. If your partner already called Mum this week, that contact's priority should drop significantly (but not to zero — you may still want to check in yourself). This avoids both partners duplicating the same check-ins. Check the `SnoozedItem` table and exclude any item that has a `snoozedUntil` timestamp in the future. The algorithm should return a sorted list of suggested actions with scores. Use `weekStartDay` from UserPreferences when calculating "this week" boundaries. Write this as a pure function with unit tests.

### TASK-012: Build main dashboard with prioritised items
- **Status**: pending
- **Priority**: high
- **Dependencies**: TASK-011, TASK-010
- **Description**: Create the Dashboard tab (home screen). Show: (1) a greeting with a quick life-balance summary ("3 contacts overdue, partner time is low this week"), (2) a "Top priorities" list showing the 5-7 highest-scored items from the priority algorithm, each with a quick-action button (e.g., "Log check-in" or "Log activity"), (3) a mini balance chart showing this week's overview. Tapping an item navigates to the relevant detail view.

### TASK-013: Build "I have free time" flow — input step
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-011
- **Description**: Add a prominent "I have free time" button on the dashboard. Tapping it opens a quick flow: step 1 asks "How much time do you have?" with preset buttons (15 min, 30 min, 1 hour, 2+ hours) and a custom input. Step 2 optionally asks "How are you feeling?" (energetic, normal, low energy) to help filter suggestions (e.g., don't suggest DIY when energy is low). Store these inputs for the suggestion algorithm.

### TASK-014: Build "I have free time" flow — suggestions step
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-013
- **Description**: After the user inputs their available time and energy, run the priority algorithm filtered by: (1) activities that fit within the available time, (2) energy-appropriate suggestions, (3) weighted toward the most overdue/imbalanced areas. For time filtering: HouseholdTasks use their `estimatedMinutes` field directly. For Goals, use ~30 min as the default (representing a single work session on a milestone) — this is a sensible default since goal work is open-ended and the user can always spend more or less time. For contacts and life area activities that don't have a pre-set duration, use sensible defaults — a phone call is ~15 min, a meet-up is ~60 min, a text is ~5 min, a generic life area activity is ~30 min. These defaults should be configurable in the scorer registry so they can be tuned. Only suggest items whose estimated time fits within the available window. Present 3-5 suggestions as cards, each showing: what to do, why (e.g., "You haven't called Mum in 3 weeks"), estimated time, and life area. User can tap to accept (which navigates to log it) or dismiss to see alternatives.

### TASK-015: Build DIY/household task management
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-008, TASK-011
- **Description**: Within the DIY/Household life area, add task-specific features using the `HouseholdTask` model from TASK-004. Build a task list with title, estimated time, priority (high/medium/low), and status (pending/in-progress/done). Allow adding, editing, and completing tasks. Completed tasks move to a "Done" section. Register a `HouseholdTask` scorer with the priority algorithm (TASK-011) so that pending tasks are ranked by their priority and how long they've been waiting. These tasks feed into the "I have free time" suggestions filtered by their estimated time.

### TASK-016: Build personal goals tracking
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-008, TASK-011
- **Description**: Within the Personal Goals life area, add goal-specific features using the `Goal` model from TASK-004. Define goals with a title, description, and optional target date. Each goal can have milestones (sub-items that can be checked off). Track progress as a percentage (based on milestones completed). Register a `Goal` scorer with the priority algorithm (TASK-011) so that goals with approaching target dates or stalled progress are surfaced. Goals feed into the "I have free time" suggestions. Keep it simple — this isn't a full project management tool, just enough to remember what you're working toward.

### TASK-017: Build reusable QR code generation and scanning components
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-002
- **Description**: Create two reusable React components: (1) `QRDisplay` — takes a data string (up to ~2KB compressed), renders it as a QR code using `react-qr-code`. Supports displaying a sequence of QR codes with manual "Next" button if the payload requires multiple codes (needed for SDP offers/answers that exceed a single QR code after compression). Shows progress ("Code 1 of 2"). (2) `QRScanner` — opens the device camera using `html5-qrcode`, scans QR codes, and calls back with decoded data. Supports scanning multi-code sequences: tracks which parts have been received and signals when all are captured. Handle camera permission requests gracefully with a clear prompt explaining why camera access is needed. Include error states for denied permissions and unsupported browsers. **Offline requirement**: both libraries must be fully npm-installed and bundled at build time. Verify that `html5-qrcode` does not lazy-load any WASM files, polyfills, or external assets at runtime — if it does, ensure those assets are included in the service worker precache manifest. Both components must work with no internet connection.

### TASK-018: Build WebRTC peer connection and data channel for local network
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-001
- **Description**: Create a `PeerConnection` service module that wraps the WebRTC API for **local network** connectivity (no internet required). The module should accept an `iceServers` configuration parameter (defaulting to an empty array for local network mode) so it can be extended later. It should: (1) **Create an offer** — instantiate an `RTCPeerConnection` with no ICE servers configured (host candidates only, which contain local network IPs), create a data channel named "sync", generate an SDP offer, and compress it using `lz-string` for QR encoding. (2) **Accept an offer** — take a compressed SDP offer string, create a peer connection, set the remote description, generate an SDP answer, and compress it for QR encoding. (3) **Complete connection** — take a compressed SDP answer, set it as the remote description, and wait for the data channel to open. (4) **Send/receive data** — provide `send(data: string)` and `onMessage(callback)` methods that handle chunking large payloads over the data channel (WebRTC messages have a ~16KB limit per message, so split larger payloads and reassemble). (5) **Connection lifecycle** — expose connection state (connecting, open, closed, failed), a `close()` method, and timeout handling (fail gracefully if connection isn't established within 30 seconds). The module must work entirely offline on a local network. Write unit tests for the SDP compression and data chunking logic.

### TASK-019: Build sync data serialisation and merge protocol
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-004, TASK-018
- **Description**: Create a sync protocol module that handles: (1) **Export** — query all records changed since a given timestamp (or all records for first sync), serialise to JSON. Include entity type and count metadata so the receiving side can show a summary. **Entities that sync between partners**: Contact, CheckIn, LifeArea, Activity, HouseholdTask, Goal, DateNight, DateNightIdea, SavedPlace. **Entities that stay device-local** (never sent during sync): UserPreferences (each device has its own settings, week start day, etc.), SnoozedItem (personal to each user's priority view — your partner's snoozes shouldn't affect what you see). (2) **Import/Merge** — for each incoming record, compare `updatedAt` with local version. If incoming is newer, upsert it. If local is newer, keep local. Handle soft deletes (if incoming has `deletedAt`, mark local as deleted). (3) **Two-way exchange** — over an open WebRTC data channel, both sides send their changes simultaneously and merge incoming data as it arrives. Show a progress indicator (records sent/received). (4) Update `lastSyncTimestamp` in preferences after successful merge. Write unit tests for the serialisation, merge logic, and conflict resolution.

### TASK-020: Build peer-to-peer sync flow with QR signalling
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-017, TASK-019
- **Description**: Create a "Sync with Partner" screen accessible from Settings and the dashboard. The flow: (1) Device A taps "Start Sync" — creates a WebRTC offer, compresses it, and displays it as a QR code (using `QRDisplay`). Shows a "Waiting for partner to scan..." status. (2) Device B taps "Join Sync", scans Device A's QR code, generates a WebRTC answer, and displays it as a QR code. (3) Device A scans Device B's answer QR code. The peer-to-peer connection opens. (4) Both devices automatically exchange sync data over the data channel using the protocol from TASK-019. A live progress screen shows: "Sending 45 records... Receiving 23 records..." (5) When complete, both devices show a summary: "Sync complete — sent 45, received 23, conflicts resolved: 2". Record the sync timestamp. Handle connection failures gracefully with a "Retry" option.

### TASK-021: Build partner/household linking via sync
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-020
- **Description**: Create a "Link Partner" flow that piggybacks on the sync connection. Partner A taps "Link Partner" which starts the QR signalling flow (same as TASK-020). Once the WebRTC connection is established, Device A sends a link request containing its `deviceId` and a new `householdId`. Device B receives it, shows a confirmation ("Partner A wants to link with you"), and on acceptance sends back its `deviceId`. Both devices save the `householdId` and each other's `deviceId` to preferences. After linking, an initial full data sync runs automatically over the same connection. Once linked, future syncs via TASK-020 are available. Show linked status in Settings with an "Unlink" option. **Unlink behaviour**: when a user taps "Unlink", show a confirmation explaining what will happen. On confirm: clear `householdId`, `partnerDeviceId`, and `lastSyncTimestamp` from preferences. All previously synced data (contacts, check-ins, activities, etc.) **remains on the device** — unlinking does not delete shared data, it just stops future syncing. The partner activity feed (TASK-022) hides until a new partner is linked. Either partner can unlink independently — the other partner's app will simply stop recognising synced data as "partner activity" since the `partnerDeviceId` is cleared.

### TASK-022: Build partner activity feed from synced data
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-021
- **Description**: After a sync, show a simple activity feed on the dashboard displaying recent actions by your partner (identified by their `deviceId` on records). Show: check-ins they logged, activities they completed, tasks they finished. This helps coordination without needing to explicitly communicate every action. Display the 20 most recent partner activities with timestamps. The priority algorithm (TASK-011) already handles partner-aware scoring — this feed is purely informational so you can see what your partner has been up to. Keep it read-only and simple.

### TASK-023: Build client-side reminder system
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-011, TASK-002
- **Description**: Implement an on-open reminder system that fires **when the user opens the app**, not in the background. Since this is a serverless PWA with no push notification server, true background notifications are not possible — reminders only appear when the app is actively opened. On each app open: (1) Check the priority algorithm for overdue items. (2) If the app hasn't been opened in over a day, show a "Welcome back" banner at the top of the dashboard summarising what needs attention (e.g., "3 contacts overdue, self-care time is low this week"). (3) Use the Notification API (with user permission) to show 1-2 local notifications for the most urgent items — these appear as OS-level notifications even though the app is open, which is useful if the user switches away immediately. Limit to 2-3 notifications per app-open session to avoid being annoying. Store last notification timestamps in preferences to avoid showing the same reminder repeatedly within 24 hours. Request notification permission during onboarding with a clear explanation of what they'll get ("reminders when you open the app").

### TASK-024: Build notification preferences UI
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-023
- **Description**: In the Settings page, add a notifications section: toggle notifications on/off globally, choose which types of reminders to receive (contact check-ins, life area imbalance, task reminders). Save preferences locally. Include a "Test notification" button that sends a sample notification immediately.

### TASK-025: Build onboarding flow for first-time users
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-005, TASK-008, TASK-040
- **Description**: When the app first opens (no data in local DB), show a guided onboarding: (1) Welcome screen explaining what Balance does, (2) "Add your important people" — prompt to add 3-5 key contacts with tiers (check-in frequency auto-fills from tier defaults, user can adjust), (3) "Set your balance targets" — show the default life areas and let users adjust weekly hour targets, (4) "Choose your week start day" — Monday (default) or Sunday, saved to `weekStartDay` in preferences, (5) "Choose your theme" — Light, Dark, or System (default) with a live preview of each option, saved to `theme` in preferences, (6) "You're all set" — navigate to the dashboard. Allow skipping any step. Mark onboarding complete in user preferences.

### TASK-026: Build data export and import for backup and device migration
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-004
- **Description**: Build a full data export/import feature. **Export**: a "Download Backup" button that queries **all** entities from the local database (Contact, CheckIn, LifeArea, Activity, HouseholdTask, Goal, DateNight, DateNightIdea, SavedPlace, SnoozedItem, UserPreferences), serialises them into a single JSON file with a version number and export timestamp, and triggers a browser file download (e.g., `balance-backup-2026-02-16.json`). Unlike sync (which excludes device-local entities), export includes everything — it's a complete snapshot of the device's state. **Import**: a "Restore from Backup" button that opens a file picker, reads the JSON file, validates its structure and version, and shows a summary of what it contains ("42 contacts, 156 check-ins, 5 life areas..."). The user then chooses: (1) **Replace all** — clears existing data and imports everything (for moving to a new device), or (2) **Merge** — uses last-write-wins conflict resolution (compare `updatedAt` timestamps, newer wins, propagate soft deletes) to combine imported data with existing data (for restoring without losing recent changes). **Important**: extract this merge logic as a shared utility module (e.g., `lib/merge.ts`) so that TASK-019 (sync protocol) can import and reuse the same code rather than duplicating it. The merge utility should be entity-type-agnostic — it takes two records with `updatedAt` and `deletedAt` fields and returns the winner. Show a confirmation before either action. Include error handling for corrupt or incompatible files.

### TASK-027: Build settings page
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-002, TASK-004
- **Description**: Create the Settings tab with sections: (1) Partner — link/unlink partner (links to TASK-021 flow), show linked status and last sync time, (2) Sync — button to start peer-to-peer sync flow, sync history showing past sync timestamps, (3) Notifications — links to TASK-024 preferences, (4) Saved Places — links to saved places management screen (TASK-033), (5) Data — links to export/import (TASK-026), clear all local data (with confirmation), (6) Preferences — week start day (Monday/Sunday), theme (Light/Dark/System), (7) About — app version. Keep it clean and simple.

### TASK-028: Add quick-action shortcuts from dashboard
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-012
- **Description**: On each priority item in the dashboard, add contextual quick actions so users can act without navigating away: "Call" button that opens the phone dialer (using `tel:` link if phone number stored on the contact), "Log it" button that opens an inline check-in or activity form as a bottom sheet/modal, "Snooze" button that creates a `SnoozedItem` record (from TASK-004) with `snoozedUntil` set to 24 hours from now — the priority algorithm (TASK-011) already excludes snoozed items. Clean up expired `SnoozedItem` records on app open. These reduce friction for time-poor users.

### TASK-029: Implement recurring partner date-night reminders
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-012, TASK-021, TASK-011
- **Description**: Add a special "date night" feature under Partner Time using the `DateNight` and `DateNightIdea` models from TASK-004, and the `dateNightFrequencyDays` preference (already defined in TASK-004, defaults to 14). Build a date-night section accessible from the Partner Time life area and the dashboard: log date nights with a date and optional notes, show how long since the last one. Register a `DateNight` scorer with the priority algorithm (TASK-011) so it surfaces prominently when overdue — date nights should score higher than most other items when past their target frequency. If a partner is linked, both see date night records after syncing. Include a small ideas bank: users can add date ideas (stored as `DateNightIdea` records) and tap a "Surprise me" button to pick one at random.

### TASK-030: PWA optimisation and offline reliability
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-010, TASK-017, TASK-020, TASK-033
- **Description**: Verify and harden the app's offline reliability. Specifically: (1) Confirm the service worker precache manifest includes every static asset — run the app with DevTools in "Offline" mode after first load and verify every page, every component, and every feature (QR scanning, charts, location) works with no network. (2) Verify no runtime requests leave the device (use Network tab to confirm zero failed fetches when offline). (3) Optimise the PWA manifest (icons in multiple sizes, theme colour, splash screen, `display: standalone`). (4) Add an "Add to Home Screen" prompt for mobile users who haven't installed it yet. (5) Test the complete offline flow on both iOS Safari and Android Chrome — install the PWA, enable airplane mode, and verify: navigation, adding contacts, logging check-ins, logging activities, dashboard, "I have free time" flow, QR code display, camera scanning, and local network WebRTC sync all work. (6) Ensure service worker updates are handled gracefully — when the user comes online and a new version is available, show a non-intrusive "Update available" prompt rather than force-refreshing.

### TASK-031: End-to-end testing of core flows
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-014, TASK-021
- **Description**: Write end-to-end tests using Playwright that exercise the app in a real browser. These complement the unit tests (TASK-038) and component tests (TASK-039) by testing full user journeys with real navigation, service worker, and IndexedDB. Target flows: (1) **Onboarding** — fresh load, add first contact, set check-in frequency, verify it appears on dashboard. (2) **Check-in logging** — from dashboard, tap a contact, log a check-in, verify the "last contacted" date updates. (3) **"I have free time" flow** — input a time slot, receive suggestions, accept one, verify the check-in is recorded. (4) **P2P sync round-trip** — open two browser contexts, use the sync flow (mock QR scanning by injecting the SDP string directly), verify data appears on both sides after sync. (5) **Partner linking** — test the link flow end-to-end with two browser contexts. (6) **Location features** — use Playwright's `context.setGeolocation()` to mock GPS and test: passive visit tracking (lastVisited/visitCount update), active logging prompt for a single saved place, overlapping-zone picker when near multiple places, "New place" quick-create flow. (7) **Export/import** — export data, clear storage, import file, verify data restored. (8) **Offline** — use `context.setOffline(true)` mid-session, verify the app continues to function (cached pages, IndexedDB reads/writes). (9) **Theme switching** — switch to dark theme in settings, verify `dark` class is applied to `<html>`, reload the page, verify the theme persists (no flash of light theme). Switch to "System" mode, use Playwright's `page.emulateMedia({ colorScheme: 'dark' })` to simulate OS dark mode, verify the app responds. Run E2E tests via `npm run test:e2e`. These are slower than unit/component tests, so keep the suite focused on the highest-value journeys.

### TASK-032: Performance and accessibility review
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-031, TASK-041
- **Description**: Run Lighthouse audits and fix any issues to achieve 90+ scores in Performance, Accessibility, Best Practices, and PWA categories. Ensure all interactive elements are keyboard accessible, have proper ARIA labels, and meet WCAG 2.1 AA colour contrast requirements. Test with screen reader. Optimise bundle size — lazy-load routes, ensure no unnecessary large dependencies. Target < 3 second initial load on 3G.

### TASK-033: Build location capture and saved places
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-004, TASK-005, TASK-009
- **Description**: Build a location service using the browser Geolocation API (which uses device GPS/Wi-Fi positioning and works offline). Create a `useLocation` hook that requests permission and returns the current position. Add a "Use my location" button to the check-in logging form (TASK-007) and activity logging form (TASK-009) that captures current lat/lng when logging. Add a "Saved Places" feature: users can save locations with a manually-typed label and link them to one or more contacts and/or life areas (e.g., a friend's house is both their contact location and a "Social" spot). On the contact edit form, add an optional "Their place" field where the user can tap "Set to current location" or pick from saved places. Saved places have a configurable radius (default 200m) used for proximity detection. **Saved Places management screen**: accessible from Settings, showing all saved places as a list. Each entry shows: label, linked contacts/life areas, visit count, and last visited date. Tapping a place opens an edit form to change the label, adjust the radius, add/remove linked contacts or life areas, or delete the place (soft delete). Handle location permission gracefully — explain why it's useful, and ensure everything still works if permission is denied. **Offline requirement**: do not use any external geocoding, reverse geocoding, or map tile APIs. Place names are always user-typed labels, not looked up from coordinates. No map views — location is stored as raw lat/lng and matched by proximity only.

### TASK-034: Build location-aware quick logging suggestions
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-033, TASK-011
- **Description**: When the app is opened, check the user's current location against saved places. This has both a **passive** and **active** component:

  **Passive tracking**: If the user is within the radius of any saved place, silently update that place's `lastVisited` timestamp and increment `visitCount` — no user interaction needed. This builds up useful visit history over time (e.g., "You've been to the gym 12 times this month" or "Last visited Mum's: 3 weeks ago") and can feed into the priority algorithm to give context on how frequently places are actually visited.

  **Active logging**: Show a contextual prompt at the top of the dashboard for the user to explicitly log something. **If near a single saved place**: "You're near Mum's house — log a visit?" or "You're at the gym — log a workout?". Tapping the prompt opens a pre-filled check-in or activity form. **If near multiple overlapping saved places** (e.g., a shopping centre that contains both a gym and a cafe): show all matching places as a short list and let the user pick which one this visit relates to — "Where are you? The Gym / Costa Coffee / Just browsing". The selected place gets the active log; all matched places still get passive `lastVisited` updates. Dismiss the prompt if the user taps "Not now" and don't show it again for the same place(s) within 4 hours.

  This check should be lightweight — only run on app open, not continuously tracking in the background. Location-tagged check-ins and activities should show the place name in their history views for context. **When NOT near any saved place**, show a different prompt: "New place? Save it" with a quick-create flow (see TASK-035).

### TASK-035: Build location-triggered quick-create flow
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-034, TASK-005
- **Description**: When a user is somewhere new (not near any saved place) and taps "New place? Save it" from the TASK-034 prompt, or taps a dedicated "I'm here" button on the dashboard, open a quick-create flow that uses the current location as the starting point. Step 1: "Name this place" — enter a label (e.g., "The park", "Jo's house", "That nice cafe"). Step 2: "What is this place for?" — present quick-pick options: (1) **Someone's place** — creates a SavedPlace linked to an existing contact (pick from list) or a new contact (opens a streamlined add-contact form pre-filled with this location), (2) **Activity spot** — creates a SavedPlace linked to a life area (pick from list, e.g., "Self-care" for the gym, "Social" for a cafe), with an option to immediately log an activity there, (3) **DIY/errand location** — creates a SavedPlace and optionally creates a new HouseholdTask (if TASK-015 is built; if not, this option is hidden or saves the place linked to DIY/Household life area only), (4) **Just save it** — saves the place with no link for now, the user can link it later. The flow should be fast — completable in under 15 seconds for the common case. Every option saves the current GPS coordinates automatically so the user never has to think about lat/lng.

### TASK-036: Set up GitHub Actions workflow for GitHub Pages deployment
- **Status**: done
- **Priority**: high
- **Dependencies**: TASK-001
- **Description**: Create a `.github/workflows/deploy.yml` GitHub Actions workflow that builds and deploys the app to GitHub Pages. The workflow should: (1) Trigger on push to the `main` branch, (2) Install Node.js dependencies, (3) Run `next build` which produces a static export in the `/out` directory (with `basePath` set for the repository's GitHub Pages URL), (4) Deploy the `/out` directory to GitHub Pages using the `actions/deploy-pages` action. Add a `.nojekyll` file to the output so GitHub Pages doesn't process the files through Jekyll (which would break files starting with `_`). Ensure the service worker and PWA manifest paths are correct relative to the `basePath`. The workflow should also run the linter, unit tests (`npm run test:unit`), and component tests (`npm run test:component`) before building, failing the deploy if any step fails. E2E tests (`npm run test:e2e`) should run after the build succeeds but before the deploy step, using the static output in `/out` served by a local HTTP server.

### TASK-037: Add remote network P2P connectivity extension
- **Status**: pending
- **Priority**: low
- **Dependencies**: TASK-018, TASK-020
- **Description**: Extend the `PeerConnection` service (TASK-018) to support connections across different networks (when devices aren't on the same Wi-Fi). This must be a **separate code path** from the local network offering — local mode must never depend on this module or its availability. Create a `RemotePeerConnection` wrapper or configuration factory that: (1) Passes STUN server(s) (e.g., `stun:stun.l.google.com:19302`) to the `iceServers` config to gather server-reflexive ICE candidates, (2) Optionally supports a user-configured TURN server URL and credentials for cases where STUN alone fails (symmetric NATs). In the sync flow UI (TASK-020), add a toggle or option: "Local network" (default) vs. "Remote network". When "Remote" is selected, use the remote-capable connection config instead. If the remote connection fails (STUN unreachable, NAT traversal fails), show a clear message explaining why it didn't work and suggest alternatives (try local network, or use file export/import from TASK-026). In Settings, add a "Remote Sync" section where users can optionally configure a custom STUN/TURN server. Keep this entirely optional — the app should never prompt for or require internet-based connectivity unless the user explicitly chooses this mode.

### TASK-038: Unit tests for core business logic
- **Status**: pending
- **Priority**: high
- **Dependencies**: TASK-001, TASK-011, TASK-018, TASK-019, TASK-026, TASK-033
- **Description**: Write unit tests (Jest + ts-jest) covering the core business logic modules. These tests should run fast with no browser or UI dependencies. Target areas: (1) **Priority algorithm** (TASK-011) — test the scorer registry, individual scorers (recency, frequency, relationship tier weighting, partner-aware scoring), and the final sorted output. Include edge cases: contact with no check-ins, contact checked in today, all contacts at same priority, snoozed contacts excluded. (2) **Sync serialisation and merge logic** (TASK-019) — test `buildSyncPayload` produces correct JSON for each entity type, test `mergeSyncPayload` with last-write-wins resolution (local newer wins, remote newer wins, identical timestamps). Test soft-delete propagation: deleted item on one side merges correctly. Test that device-local entities (UserPreferences, SnoozedItem) are excluded from sync payloads. (3) **WebRTC service** (TASK-018) — test the `PeerConnection` wrapper in isolation using mocked `RTCPeerConnection`. Verify SDP offer/answer flow, ICE candidate handling, data channel open/close lifecycle, and connection timeout behaviour. Test that local-network mode uses empty `iceServers`. (4) **Location proximity** (TASK-034) — test the distance calculation function (haversine or similar) with known GPS coordinates. Test radius matching: point inside zone, point outside zone, point inside overlapping zones returns all matches. (5) **Data export/import** (TASK-026) — test that export produces valid JSON containing all 11 entity types, test import with "Replace All" correctly clears and reloads, test import with "Merge" applies last-write-wins per entity. Aim for at least 80% branch coverage across these modules.

### TASK-039: Component and integration tests for UI
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-001, TASK-005, TASK-008, TASK-012, TASK-013, TASK-017, TASK-020, TASK-027, TASK-034
- **Description**: Write component tests (Jest + React Testing Library) for the key UI flows, rendering components in a jsdom environment with a mocked Dexie database. Target areas: (1) **Contact forms** (TASK-005) — test adding a new contact with all fields, editing an existing contact, validation (name required, check-in frequency > 0). (2) **Dashboard** (TASK-012) — test that the dashboard renders prioritised contacts and life areas, test that overdue items display a visual indicator, test empty state when no data exists. (3) **"I have free time" flow** (TASK-013) — test selecting a time slot, verify suggestions are rendered from the priority engine output, test tapping a suggestion marks it as done and records a check-in. (4) **QR code display and scanner** (TASK-017) — test that the QR code component renders an SVG/canvas element with the expected data, test the scanner component mounts and calls the expected `html5-qrcode` API (mock the camera). (5) **Sync flow UI** (TASK-020) — test the full initiator and joiner flows with mocked WebRTC: initiator shows QR with SDP offer, joiner scans and shows answer QR, connection established triggers sync, progress indicator shown, success/error states rendered correctly. (6) **Life area detail page** (TASK-008, TASK-009) — test that activities are listed, test logging a new activity updates the list. (7) **Settings page** (TASK-027) and **export/import** (TASK-026) — test toggling preferences updates Dexie, test export button triggers a download, test import with file picker. (8) **Location prompt** (TASK-034) — test that the "You're near X" prompt appears when a mocked geolocation returns coordinates inside a saved place radius, test the overlapping-zone picker displays all matching places. (9) **Theme system** (TASK-040) — test that the theme toggle renders three options (Light/Dark/System), test that selecting "dark" adds the `dark` class to `<html>`, test that selecting "system" reads from a mocked `window.matchMedia('(prefers-color-scheme: dark)')`, test that the theme preference persists to Dexie. Aim for at least one happy-path and one edge-case test per component.

### TASK-040: Set up theme system with light, dark, and system modes
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-001, TASK-002, TASK-004
- **Description**: Build the theming infrastructure for light and dark mode support. Configure Tailwind CSS dark mode using the `class` strategy (not `media`) so the app can override the OS preference when the user chooses a specific theme. Create a `ThemeProvider` React context that: (1) Reads the `theme` preference from UserPreferences in Dexie ("light", "dark", or "system" — defaults to "system"). (2) When set to "system", uses `window.matchMedia('(prefers-color-scheme: dark)')` to detect the OS preference and listens for changes (e.g., OS switching to dark mode at sunset). (3) Applies or removes the `dark` class on the `<html>` element accordingly. (4) Provides a `useTheme()` hook that returns the current resolved theme ("light" or "dark") and a `setTheme()` function that writes to Dexie and updates the class immediately. (5) On initial load, apply the theme **before first paint** to prevent a flash of the wrong theme — read the preference synchronously from localStorage as a fast cache (Dexie is async), then confirm from Dexie once loaded. Define a design token system using CSS custom properties (variables) for colours that change between themes: background, surface, text-primary, text-secondary, border, accent, success (green), warning (amber), danger (red), and card backgrounds. Map these tokens to Tailwind's theme configuration so components can use classes like `bg-surface` or `text-primary` that automatically resolve based on the active theme. Ensure the PWA manifest `theme_color` and `background_color` use a neutral colour that works acceptably in both modes (since the manifest is static).

### TASK-041: Apply dark theme styling across all UI components
- **Status**: pending
- **Priority**: medium
- **Dependencies**: TASK-040, TASK-012, TASK-006, TASK-008
- **Description**: Audit and update every UI component to support both light and dark themes using the design tokens and Tailwind `dark:` variants from TASK-040. Key areas to style: (1) **Layout shell** (TASK-002) — header, bottom navigation bar, and background. (2) **Dashboard** (TASK-012) — priority cards, balance summary, greeting text, "I have free time" button. (3) **Contacts** (TASK-006) — contact cards, tier badges, overdue indicators (ensure green/amber/red remain distinguishable in both themes). (4) **Life areas** (TASK-008, TASK-010) — area cards, progress bars, balance chart/visualisation. (5) **Forms** — all input fields, dropdowns, buttons, and modals across check-in logging, contact editing, activity logging, etc. (6) **QR code screens** (TASK-017) — ensure QR codes remain scannable in dark mode (QR codes need high contrast — use a white background behind the QR code regardless of theme). (7) **Sync flow** (TASK-020) — progress indicators, status messages. (8) **Settings page** (TASK-027) — toggle sections, the theme selector itself. (9) **Onboarding** (TASK-025) — ensure the theme preview step looks correct. (10) **Location prompt** (TASK-034) — the "You're near X" banner, overlapping-zone picker, and "Not now" dismiss button. (11) **Quick-create flow** (TASK-035) — the place naming form, quick-pick options, and contact/life-area linking steps. (12) **Saved places management** (TASK-033) — the saved places list, edit form, and delete confirmation. Test both themes visually on mobile and desktop. Ensure all text meets WCAG 2.1 AA contrast ratios in both themes (minimum 4.5:1 for body text, 3:1 for large text). Pay special attention to the overdue colour indicators — they must be distinguishable in both light and dark modes.
