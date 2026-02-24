# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Instructions

## General
- This app is only for me, so always show the full error message, not a user-friendly message
- Add console.log to backend or frontend code to make it easier to debug issues (I'm following the server output)  

## Commands

```bash
npm run dev        # Start dev server (port 3000)
npm run build      # Production build
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript type check
```

No test framework is configured yet.

Always run ESLint and TypeScript type check after making changes.

## Architecture

**Stack**: Next.js (App Router) + TypeScript + Tailwind CSS v4 + SQLite + whisper.cpp (local)

**App Router**: All pages and API routes live under `src/app/`. Path alias `@/*` maps to `src/*`.

**Storage** (Docker volume at `/data`):
- `/data/podcasts.db` — SQLite database
- `/data/audio/` — Downloaded podcast audio files

**Environment**: No API keys required. Transcription uses local whisper.cpp bundled in Docker image.

**SQLite tables**: `podcasts`, `episodes`, `transcriptions`, `playback_settings` — see SPEC.md for full schema.

**API routes** (to be built under `src/app/api/`):
- `/api/podcasts` — CRUD + RSS refresh
- `/api/podcasts/[id]/episodes`, `/api/episodes/[id]` — episode data
- `/api/episodes/[id]/playback` — playback position/speed persistence
- `/api/transcriptions` — Whisper transcription queue and results
- `/api/audio/stream/[episodeId]` — audio streaming from `/data/audio/`

**Playback state persistence**: playback speed is per-podcast; playback position is per-episode; both stored in SQLite.

**Transcription**: Manual trigger per episode, German language, word-level timestamps via local whisper.cpp. Status: `pending` → `in_progress` → `completed` / `failed`.

**Player layout**: Persistent audio player at the bottom of page; transcript (karaoke-style highlighting) below.
