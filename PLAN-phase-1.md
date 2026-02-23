# Phase 1 Implementation Plan: RSS Management & Podcast Player

## Context

Building the foundation of a personal German podcast vocabulary extractor. Phase 1 covers podcast subscription via RSS, local episode downloads, and an audio player with persistent playback state. The codebase is a fresh Next.js 16 scaffold — no API routes, components, or DB exist yet.

---

## Step 0: Infrastructure Setup

### 0a. Fix `docker-compose.yml` — add `/data` volume
Currently missing. Add a named volume mounted at `/data` for SQLite DB + audio files.

### 0b. Install dependencies
```bash
npm install drizzle-orm better-sqlite3 rss-parser
npm install -D drizzle-kit @types/better-sqlite3
```

### 0c. Initialize shadcn/ui
```bash
npx shadcn@latest init
npx shadcn@latest add button slider input card scroll-area separator progress toast dialog
```

### 0d. Create `drizzle.config.ts` at project root
Configure for SQLite dialect, schema at `./src/db/schema.ts`, DB at `/data/podcasts.db`.

### 0e. Add npm scripts
- `db:push` → `drizzle-kit push`

---

## Step 1: Database Schema + Connection

### `src/db/schema.ts`
Drizzle table definitions for: `podcasts`, `episodes`, `playback_settings`, `transcriptions` (created now, populated in Phase 2). Dates as ISO 8601 text. Export inferred types (`Podcast`, `Episode`, etc.). Add `guid` column to episodes for deduplication.

### `src/db/index.ts`
Singleton: create `better-sqlite3` instance at `/data/podcasts.db`, enable WAL mode + foreign keys, wrap with `drizzle()`. Ensure `/data/audio/` directory exists.

Run `npx drizzle-kit push` to create tables.

---

## Step 2: RSS Parsing Utility — `src/lib/rss.ts`

Use `rss-parser` to fetch and parse RSS feeds. Extract: title, description, audioUrl (from `enclosure`), guid, pubDate, duration. Sort episodes newest-first. Filter out entries with no audio URL. Parse `itunes:duration` (HH:MM:SS or seconds) to integer seconds.

---

## Step 3: Download Utility — `src/lib/download.ts`

Download audio URL to `/data/audio/{episodeId}.{ext}`. Use streaming writes (`pipeline` + `createWriteStream`) to handle large files without memory spikes. Return the file path to store in DB.

---

## Step 4: Business Logic — `src/lib/podcast-service.ts`

- **`addPodcast(rssUrl)`** — parse feed, insert podcast + episodes, fire-and-forget download of latest 10
- **`refreshAllFeeds()`** — re-parse each feed, insert new episodes (deduplicate on `guid` with `audioUrl` fallback), download latest 10 un-downloaded per podcast
- **`deletePodcast(id)`** — delete from DB (cascade), delete audio files from disk
- **`downloadEpisode(episodeId)`** — download audio, update `file_path` in DB

Background downloads: `Promise.allSettled` with concurrency limit of 3. Don't await in API handler — return immediately.

---

## Step 5: API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/podcasts` | GET | List all podcasts |
| `/api/podcasts` | POST | Add RSS feed, body: `{ rssUrl }` |
| `/api/podcasts/[id]` | DELETE | Delete podcast + cascade |
| `/api/podcasts/refresh` | POST | Refresh all feeds |
| `/api/podcasts/[id]/episodes` | GET | Episodes for podcast, newest first |
| `/api/episodes/[id]` | GET | Single episode details |
| `/api/episodes/[id]/download` | POST | Download episode audio |
| `/api/episodes/[id]/playback` | GET | Get position + speed |
| `/api/episodes/[id]/playback` | PATCH | Update position and/or speed |
| `/api/audio/stream/[episodeId]` | GET | Stream audio with Range support |

**Audio streaming**: Must support HTTP Range requests (206 Partial Content) for `<audio>` seeking.

---

## Step 6: Player State Management

### `src/components/player-provider.tsx` (client component)
React context managing: `currentEpisode`, `isPlaying`, `playbackSpeed`, `currentTime`, `duration`, and an `HTMLAudioElement` ref.

Key behaviors:
- `play(episode, podcast)` — set src to `/api/audio/stream/${id}`, fetch+apply saved position/speed
- Save position every 5s during playback (periodic save only — simple, at most 5s loss)
- Speed changes PATCH to API immediately

### `src/hooks/use-player.ts`
Simple `useContext` wrapper.

---

## Step 7: Player Bar UI — `src/components/player-bar.tsx`

Fixed bottom bar (`fixed bottom-0`), hidden when no episode loaded. Layout:
- Left: episode title + podcast name
- Center: rewind 10s, play/pause, speed badge (click to cycle common values)
- Right: current time / duration, progress slider (shadcn Slider)

---

## Step 8: Frontend Pages + Components

### `src/app/page.tsx` — Podcast List
Server component. Shows all podcasts as cards (name, latest episode date, episode count). "Add Podcast" button opens dialog. "Refresh All" button. Click podcast → `/podcasts/[id]`.

### `src/app/podcasts/[id]/page.tsx` — Episode List
Server component. Episodes sorted newest-first. Each row: title, date, duration, download/play button based on `filePath` status.

### Client components:
- `src/components/podcast-list.tsx` — interactive podcast cards with delete
- `src/components/add-podcast-dialog.tsx` — dialog with RSS URL input
- `src/components/episode-list.tsx` — episode rows with download/play actions

Mutations via `fetch()` to API routes, then `router.refresh()` to revalidate.

---

## Step 9: Layout Wiring — `src/app/layout.tsx`

Wrap children with `<PlayerProvider>`. Add `<PlayerBar />` after children. Add `pb-24` to body for player clearance. Update metadata title.

---

## File Structure Summary

```
src/
├── app/
│   ├── layout.tsx                          # modify: add PlayerProvider + PlayerBar
│   ├── page.tsx                            # modify: podcast list page
│   ├── globals.css                         # modify: bottom padding for player
│   ├── podcasts/[id]/page.tsx              # new: episode list page
│   └── api/
│       ├── podcasts/
│       │   ├── route.ts                    # GET + POST
│       │   ├── refresh/route.ts            # POST
│       │   └── [id]/
│       │       ├── route.ts                # DELETE
│       │       └── episodes/route.ts       # GET
│       ├── episodes/[id]/
│       │   ├── route.ts                    # GET
│       │   ├── download/route.ts           # POST
│       │   └── playback/route.ts           # GET + PATCH
│       └── audio/stream/[episodeId]/route.ts  # GET
├── components/
│   ├── ui/                                 # shadcn (auto-generated)
│   ├── podcast-list.tsx
│   ├── add-podcast-dialog.tsx
│   ├── episode-list.tsx
│   ├── player-bar.tsx
│   └── player-provider.tsx
├── db/
│   ├── schema.ts
│   └── index.ts
├── lib/
│   ├── utils.ts                            # shadcn utility (auto-generated)
│   ├── rss.ts
│   ├── download.ts
│   └── podcast-service.ts
└── hooks/
    └── use-player.ts
drizzle.config.ts                           # project root
```

---

## Architectural Decisions

1. **Server components for reads, API routes for mutations** — pages query DB directly, client components call API routes for writes
2. **Fire-and-forget downloads** — API returns immediately, downloads run in background with concurrency limit of 3
3. **Deduplicate episodes on `guid` with `audioUrl` fallback** — use RSS guid when available, fall back to audioUrl. Add `guid` column to episodes table.
4. **Streaming file writes** — use `pipeline` + `createWriteStream` for large audio files
5. **Drizzle `push` (no migrations)** — simpler for a personal app
6. **No SWR/React Query** — plain `fetch` + `router.refresh()` is sufficient for single-user

---

## Verification

1. `npx tsc --noEmit` after each step
2. `npm run build` after all steps
3. Manual test flow:
   - Add a German podcast RSS feed (e.g., Tagesschau)
   - Verify episodes appear, latest 10 start downloading
   - Wait for downloads, then play an episode
   - Test: play/pause, speed change, rewind, seeking
   - Navigate away and return — verify position/speed persisted
   - Refresh feeds — verify new episodes discovered
   - Delete podcast — verify cascade cleanup

---

## Resolved Questions

1. **Episode dedup**: Use RSS `guid` with `audioUrl` fallback. Add `guid` column to episodes table.
2. **Position save**: Periodic save every 5s only. Simple, at most 5s of position loss.
