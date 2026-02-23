# Phase 2: Transcription & Click-to-Play — Implementation Plan

## Context

Phase 1 (RSS management, podcast player, audio streaming) is complete. Phase 2 adds OpenAI Whisper transcription, karaoke-style transcript display, and click-to-play segment interaction. The `transcriptions` table already exists in the DB schema but is unused.

---

## 1. Dependencies & Docker

**Modify `Dockerfile`**: Add `ffmpeg` to `apt-get install` line (needed for audio compression/splitting before Whisper API).

**Install `openai` npm package**: `npm install openai`

---

## 2. Transcription Service

**Create `src/lib/transcription-service.ts`**

Core backend logic with these functions:

- **`compressAudio(inputPath)`** — Call ffmpeg via `child_process.execFile` to re-encode: mono, 16kHz, 32kbps mp3. Output to `/data/audio/tmp/<episodeId>/`.

- **`splitAudio(compressedPath, maxSize=25MB)`** — Check file size. If under 25MB, return single chunk. If over, get duration via ffmpeg, calculate chunk duration proportionally, split with `ffmpeg -ss <start> -t <dur> -c copy`. Return `Array<{ path, offsetSeconds }>`.

- **`transcribeChunk(chunkPath)`** — Call OpenAI Whisper API:
  ```ts
  client.audio.transcriptions.create({
    file: fs.createReadStream(chunkPath),
    model: "whisper-1",
    language: "de",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  })
  ```
  Return mapped segments `{ start, end, text }`.

- **`transcribeEpisode(episodeId)`** — Orchestrator:
  1. Set transcription status to `in_progress`
  2. Compress audio
  3. Split if needed
  4. Transcribe each chunk
  5. Stitch timestamps (add `offsetSeconds` to segments from chunks after the first)
  6. Save segments JSON + set status `completed`
  7. On error: set status `failed` with error message
  8. Clean up temp files in all cases

---

## 3. API Routes

### `POST /api/transcriptions` (create `src/app/api/transcriptions/route.ts`)
- Body: `{ episodeId }`
- Validate: episode exists, is downloaded, no pending/in_progress transcription
- Delete existing `failed` transcription if present (allow retry)
- Insert new row with status `pending`
- Fire-and-forget: call `transcribeEpisode(episodeId)`
- Return 202

### `GET /api/transcriptions/[episodeId]` (create `src/app/api/transcriptions/[episodeId]/route.ts`)
- Return full transcription with parsed segments JSON, or 404

### `GET /api/transcriptions/status/[episodeId]` (create `src/app/api/transcriptions/status/[episodeId]/route.ts`)
- Return `{ status, errorMessage }` only (lightweight, for polling)

**Polling strategy**: Frontend polls status every 3s for pending/in_progress transcriptions. Simple and sufficient for single-user app.

---

## 4. Player Provider Changes

**Modify `src/components/player-provider.tsx`**

Add segment playback mode:

- New state: `segmentEnd: number | null` (+ a ref for use in event listener)
- New method: `playSegment(startTime, endTime)` — seek to start, set segmentEnd, play
- In `timeupdate` listener: if `segmentEndRef.current !== null && currentTime >= segmentEndRef.current`, pause and clear segment mode
- `togglePlayPause`: clear segmentEnd when resuming after segment pause
- `seek` / `rewind`: clear segmentEnd (user takes manual control)

**Modify `src/components/player-bar.tsx`**

- When `segmentEnd !== null`: hide rewind/speed controls, only show pause button (per spec)

---

## 5. Episode List: Transcribe Button & Status

**Modify `src/components/episode-list.tsx`**

- On mount: fetch transcription status for all downloaded episodes
- Poll every 3s for episodes with `pending`/`in_progress` status
- Per episode (after play button), show:
  - No transcription: "Transcribe" button (FileText icon)
  - `pending`/`in_progress`: spinning loader, disabled
  - `completed`: green check icon
  - `failed`: red alert icon with error in title attribute, retry button

---

## 6. Transcript Display

**Create `src/components/transcript-display.tsx`**

- Props: `segments[]`, `currentTime`, `onSegmentClick(segment)`
- Render segments in a ScrollArea
- **Karaoke highlighting**: find active segment where `start <= currentTime < end`, apply highlight class
- **Auto-scroll**: `scrollIntoView({ behavior: "smooth", block: "center" })` when active segment changes
- **Click handler**: calls `onSegmentClick` with the clicked segment
- Show timestamp (mm:ss) before each segment text

**Create `src/components/episode-transcript.tsx`**

- Client component using `usePlayer()` to get `currentEpisode`, `currentTime`, `playSegment`
- Fetches transcript from `/api/transcriptions/[episodeId]` when currentEpisode changes
- Renders `<TranscriptDisplay>` if transcript is completed
- Shows "Transcription in progress..." for pending/in_progress

**Modify `src/app/podcasts/[id]/page.tsx`**

- Add `<EpisodeTranscript podcastId={id} />` after `<EpisodeList />`

---

## 7. Shared Type

**Create `src/types/transcription.ts`**

```ts
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}
```

---

## File Summary

| File | Action |
|------|--------|
| `Dockerfile` | Modify — add ffmpeg |
| `package.json` | Modify — add openai |
| `src/types/transcription.ts` | Create |
| `src/lib/transcription-service.ts` | Create |
| `src/app/api/transcriptions/route.ts` | Create |
| `src/app/api/transcriptions/[episodeId]/route.ts` | Create |
| `src/app/api/transcriptions/status/[episodeId]/route.ts` | Create |
| `src/components/player-provider.tsx` | Modify |
| `src/components/player-bar.tsx` | Modify |
| `src/hooks/use-player.ts` | No change (re-exports full context) |
| `src/components/episode-list.tsx` | Modify |
| `src/components/transcript-display.tsx` | Create |
| `src/components/episode-transcript.tsx` | Create |
| `src/app/podcasts/[id]/page.tsx` | Modify |

## Implementation Order

1. Dockerfile + `npm install openai`
2. Shared type (`src/types/transcription.ts`)
3. Transcription service (`src/lib/transcription-service.ts`)
4. API routes (all 3)
5. Player provider + player bar changes (segment mode)
6. Episode list changes (transcribe button + status)
7. Transcript display + episode transcript components
8. Podcast detail page integration

## Verification

- Build: `npm run build`
- Lint: `npm run lint`
- Types: `npx tsc --noEmit`
- Manual test: download an episode, click Transcribe, verify status polling, verify transcript appears with highlighting, click segment to test click-to-play

## Unresolved Questions

1. **Transcript visibility across pages**: Should the transcript only show on the podcast detail page, or also on the home page? Current plan: only on podcast detail page.
2. **Long episode progress**: For episodes >1hr, transcription may take minutes. Is a simple "In Progress" spinner sufficient, or do you want a more detailed progress indicator (e.g., chunk X of Y)?
3. **openai package version**: Use latest available, or pin to a specific version?
