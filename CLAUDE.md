# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Maintenance

When adding/removing API routes, DB tables, or making key architectural changes, always update the relevant sections in this file to keep it in sync.

## General

- This app is only for me, so always show the full error message, not a user-friendly message
- Add console.log to backend or frontend code to make it easier to debug issues (I'm following the server output)

## Commands

```bash
npm run dev        # Start dev server (port 3000)
npm run worker     # Start transcription worker (standalone)
npm run build      # Production build
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript type check
npm run db:push    # Push Drizzle schema changes to SQLite
npx tsx scripts/backup-db.ts  # Manual DB backup (SQL dump to data/backups/)
```

**NEVER use `--force` with `drizzle-kit push`.** It can silently truncate tables with data. When adding a not-null column to an existing table, write a raw SQL migration instead (e.g. `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...`).

**Always run `npx tsx scripts/backup-db.ts` before any Drizzle schema changes** (`db:push`, migrations, etc.). The backup runs automatically on container startup, but run it manually before local schema operations.

No test framework is configured yet.

Always run ESLint and TypeScript type check after making changes.

## Architecture

**Stack**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Shadcn UI + Drizzle ORM + SQLite + whisper.cpp (local) + OpenAI (translation)

**App Router**: All pages and API routes live under `src/app/`. Path alias `@/*` maps to `src/*`.

**Docker**: App runs in Docker with whisper.cpp binary, ffmpeg, and Node.js bundled. Supervisord manages two processes: Next.js dev server and the transcription worker. Web UI at port 9001. Use `docker-compose.yml` to run.

**Storage** (Docker volume at `/data`):
- `/data/podcasts.db` — SQLite database (WAL mode, foreign keys enabled)
- `/data/audio/{podcastId}/{episodeId}.{ext}` — Downloaded podcast audio files
- `/data/audio/tmp/` — Temporary ffmpeg outputs during transcription
- `/data/whisper/ggml-medium.bin` — Whisper model file

**Environment**: `OPENAI_API_KEY` required in `.env.local` for German→Czech translation (see `.env.example`).

**SQLite tables** (Drizzle schema in `src/db/schema.ts`):
- `podcasts` — Podcast metadata (UUID PK, `type`: "rss" | "collection")
- `episodes` — Episodes per podcast, deduped by guid/audioUrl (UUID PK, `done` boolean)
- `transcriptions` — Whisper transcription results + translation data (UUID PK)
- `playbackSettings` — Playback speed per podcast (podcastId PK)
- `flashcards` — User-created flashcards from transcript words (UUID PK)

**API routes** (`src/app/api/`):
- `/api/podcasts` — CRUD, `/api/podcasts/refresh` — refresh all feeds
- `/api/podcasts/[id]/episodes` — episodes for podcast
- `/api/episodes/[id]` — GET episode details, PATCH `{ done }` to toggle done status
- `/api/episodes/[id]/download` — download episode audio
- `/api/episodes/[id]/playback` — GET/PATCH playback position & speed
- `/api/transcriptions` — POST to enqueue, GET for batch status
- `/api/transcriptions/[episodeId]` — GET transcript segments & translations
- `/api/transcriptions/[episodeId]/translate` — POST to trigger translation
- `/api/transcriptions/status/[episodeId]` — GET transcription status
- `/api/audio/stream/[episodeId]` — audio streaming with HTTP range support
- `/api/collections` — POST to create a collection (virtual podcast for uploads)
- `/api/collections/[id]/upload` — POST multipart upload audio file into collection
- `/api/flashcards`, `/api/flashcards/[id]` — flashcard CRUD
- `/api/anki/browse` — POST proxy to AnkiConnect `guiBrowse` (opens Anki card browser with search query)

**Key patterns**:
- Server components for reads, API routes for mutations
- Background worker process (`src/worker/transcription-worker.ts`) polls DB for pending transcriptions/translations, processes sequentially (one at a time, prevents memory issues)
- Fire-and-forget downloads with concurrency limit of 3
- Playback speed is per-podcast, playback position is per-episode
- Transcription: manual trigger, German language, word-level timestamps via local whisper.cpp. Status: `pending` → `in_progress` → `completed` / `failed`
- Translation auto-triggered after transcription completes (German→Czech via OpenAI)
- Player: persistent audio player at bottom of page; transcript with karaoke-style highlighting in main content area

**Key services** (`src/lib/`):
- `podcast-service.ts` — RSS feed operations, downloads, cascade deletes
- `transcription-service.ts` — whisper.cpp integration, ffmpeg compression (pure functions, no queue)
- `translation-service.ts` — OpenAI batch translation with context windows
- `rss.ts` — RSS feed parsing with iTunes duration support
- `download.ts` — Audio file downloading

## LLM Models

- Use `gpt-5.2` for flashcard generation and reasoning tasks (does not support temperature)
- Use `gpt-4.1-mini` for translation tasks
