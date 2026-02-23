# Podcast Vocabulary Extractor — Application Specification

## Project Overview

A Next.js + TypeScript application for extracting vocabulary from German-language podcasts. Users subscribe to RSS feeds, download episodes locally, play them with advanced controls, and transcribe them using OpenAI Whisper API for interactive learning and vocabulary extraction.

## Technology Stack

- **Frontend**: Next.js with TypeScript
- **Backend**: Next.js API routes
- **Database**: SQLite (local)
- **Audio Transcription**: OpenAI Whisper API
- **Deployment**: Docker (local) with mounted data volume
- **Component Library**: (To be decided — shadcn/ui, MUI, or Tailwind only)

## Storage Architecture

```
/data (mounted volume from host)
├── podcasts.db (SQLite database)
└── audio/ (podcast audio files)
```

---

## Phase 1: RSS Management & Podcast Player

### 1.1 Podcast Subscription Management

**Feature**: Users can add and manage RSS feed subscriptions.

- **Add Podcast**: User provides RSS feed URL
- **Subscription List**: Display all subscribed podcasts
- **Podcast Information**: For each podcast, show:
  - Podcast name
  - Date and time of latest episode
  - All episodes separated by podcast
- **Refresh Feeds**: Button to re-fetch all RSS feeds and discover new episodes
- **Episode List**: Episodes displayed separately under each podcast (not mixed), sorted by date (newest first)
- **Delete Podcast**: Cascade deletes all associated episodes, transcriptions, and downloaded audio files

### 1.2 Episode Downloads

**Feature**: Episodes are downloaded locally before playback. Never stream from the original RSS URL.

- **Auto-download**: On subscribe and on feed refresh, automatically download the **latest 10 episodes** per podcast
- **Manual download**: Download button on each episode for older episodes not auto-downloaded
- **Storage**: Downloaded audio files stored in `/data/audio/`
- **Download status**: Track whether each episode is downloaded (via `file_path` column)
- Episodes must be downloaded before they can be played

### 1.3 Podcast Player

**Feature**: Play downloaded podcast episodes with advanced controls.

**Player Layout**:

- Player positioned as a fixed bar at the **bottom** of the page
- Transcript positioned in the main content area (Phase 2)
- Persistent player (does not disappear when navigating)

**Playback Controls**:

- Play / Pause
- Speed control: adjustable by 0.1x increments, range **0.5x to 2.0x**
- Rewind by 10 seconds
- Progress bar / timeline scrubbing
- Current time and total duration display

**Playback State Persistence**:

- Remember playback speed per podcast (global setting, applies to all episodes in that podcast)
- Remember playback position per episode (resume at last position when returning to same episode)
- Store in SQLite

**Audio Playback**:

- Play audio files from the local `/data/audio/` directory via streaming API
- Episode must be downloaded before playback is available

---

## Phase 2: Transcription & Click-to-Play

### 2.1 Manual Transcription Trigger

**Feature**: User manually selects episodes to transcribe.

- Button on each episode: "Transcribe this episode"
- Episode must be downloaded before transcription is available
- Transcription request queues in background
- Use OpenAI Whisper API (pricing: ~$0.006 per minute)
- Language: German
- Request segment-level timestamps (start time, end time, text for each segment)

**Large File Handling**:

- Whisper API has a 25MB file size limit
- Before sending to Whisper: compress audio (re-encode to mono 16kHz low-bitrate format)
- If compressed file still exceeds 25MB: split into chunks under 25MB
- Stitch segment timestamps back together across chunks (offset timestamps by chunk start time)

### 2.2 Transcript Storage & Display

**Transcript Storage**:

- Store transcription result in SQLite
- Schema should include:
  - Episode ID
  - Segments (array of: start_time, end_time, text)
  - Transcription date

**Transcript Display**:

- Show transcript below the player in the main content area
- Karaoke-style highlighting: current **segment** highlighted as audio plays
- Non-editable transcript (read-only display)
- Auto-scroll transcript to follow playback

### 2.3 Click-to-Play Interaction

**Feature**: Click any segment in the transcript to play just that segment.

- Click a sentence / segment in the transcript
- Audio plays only that segment (from segment start_time to segment end_time)
- Audio pauses automatically when segment ends
- Only the pause button is available during segment playback
- Continuing playback after pause resumes from current position with normal podcast controls

### 2.4 Transcription UI

- Show transcription status: "Pending", "In Progress", "Complete"
- Prevent multiple simultaneous transcriptions of same episode
- Store transcription errors / failures for debugging — show full error messages

---

## Data Model (SQLite)

### Tables

**podcasts**

| Column             | Type     | Description                  |
| ------------------ | -------- | ---------------------------- |
| id                 | PK       | Primary key                  |
| name               | TEXT     | Podcast name from RSS feed   |
| rss_url            | TEXT     | RSS feed URL                 |
| latest_episode_date| DATETIME | Date of most recent episode  |
| created_at         | DATETIME | Subscription creation date   |

**episodes**

| Column                 | Type     | Description                          |
| ---------------------- | -------- | ------------------------------------ |
| id                     | PK       | Primary key                          |
| podcast_id             | FK       | References podcasts.id               |
| title                  | TEXT     | Episode title                        |
| description            | TEXT     | Episode description                  |
| audio_url              | TEXT     | Original audio URL from RSS          |
| pub_date               | DATETIME | Publication date                     |
| duration               | INTEGER  | Duration in seconds                  |
| file_path              | TEXT     | Local storage path if downloaded     |
| last_playback_position | REAL     | Last playback position in seconds    |
| last_played_date       | DATETIME | When the episode was last played     |

**transcriptions**

| Column         | Type     | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| id             | PK       | Primary key                                         |
| episode_id     | FK       | References episodes.id                              |
| segments       | JSON     | Array of {start_time, end_time, text}               |
| transcribed_at | DATETIME | When transcription was completed                    |
| status         | TEXT     | pending / in_progress / completed / failed          |
| error_message  | TEXT     | Error details if transcription failed               |

**playback_settings**

| Column         | Type    | Description                              |
| -------------- | ------- | ---------------------------------------- |
| podcast_id     | PK, FK  | References podcasts.id                   |
| playback_speed | REAL    | Speed setting (0.5 to 2.0, step 0.1)    |

---

## API Routes (Backend)

### Podcast Management

- `POST /api/podcasts` — Add RSS feed (fetches feed, creates podcast + episodes, auto-downloads latest 10)
- `GET /api/podcasts` — List all subscribed podcasts
- `DELETE /api/podcasts/[id]` — Remove subscription (cascade deletes episodes, transcriptions, audio files)
- `POST /api/podcasts/refresh` — Refresh all feeds (fetch new episodes, auto-download latest 10 per podcast)

### Episodes

- `GET /api/podcasts/[id]/episodes` — Get episodes for a podcast (sorted by date, newest first)
- `GET /api/episodes/[id]` — Get single episode details
- `POST /api/episodes/[id]/download` — Download episode audio to local storage

### Playback

- `PATCH /api/episodes/[id]/playback` — Update playback position and speed
- `GET /api/episodes/[id]/playback` — Get current playback state

### Transcription

- `POST /api/transcriptions` — Request transcription for episode
- `GET /api/transcriptions/[episodeId]` — Get transcript for episode
- `GET /api/transcriptions/status/[episodeId]` — Check transcription status

### Audio Streaming

- `GET /api/audio/stream/[episodeId]` — Stream audio file from local storage

---

## Frontend Components

- **Podcast List**: Display all subscribed podcasts with latest episode info
- **Episode List**: Episodes per podcast, sorted by date (newest first), with download status
- **Podcast Player**: Fixed bottom bar with controls (play, pause, speed 0.5x–2.0x, rewind 10s, progress)
- **Transcript Display**: Scrolling transcript with segment-level karaoke highlighting
- **Transcription Button**: Manual trigger for transcription (requires downloaded episode)
- **Transcription Status**: Shows pending / in-progress / completed state with full error messages

---

## Phase 3 (Future — Not in Scope)

- Flashcard generation from transcript segments
- SRS (Spaced Repetition System) or Anki export
- Vocabulary filtering and selection UI
