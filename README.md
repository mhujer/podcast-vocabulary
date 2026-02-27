# Podcast Vocabulary Extractor

Personal app for learning German vocabulary from podcasts. Subscribe to RSS feeds, download episodes locally, play them with a persistent audio player, transcribe using local whisper.cpp, and translate segments from German to Czech.

---

Why I created this (with Claude Code)? Listening to podcasts is a nice way to practice listening to the language and learn new vocabulary. In the past I sometimes created flashcards manually from podcasts I was listening, but it was really tedious. Now it occurred to me, that I can create my personal tool which will be finetuned for my workflow.

How it works?
1. I usually listen to the podcast episode first when walking outside
2. If it is good, I download it via my app and have it transcribed
3. Then I listen to the episode again and when there is a word I'd like to have in my vocabulary, I select it let the LLM create a flashcard for me
4. After I'm done with the episode, I export the flashcards to CSV and import this CSV to Anki


---

![Screenshot](screenshot.png)

## Features

- RSS feed subscription with auto-download of latest episodes
- Audio player with speed control, rewind, position memory, and seeking
- Local transcription via whisper.cpp (German, word-level timestamps)
- Karaoke-style transcript display with click-to-play segments
- German→Czech translation via OpenAI
- Flashcard creation from transcript words
- Anki Export

## Tech Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Shadcn UI · Drizzle ORM · SQLite · whisper.cpp · OpenAI

## Setup

```bash
cp .env.example .env.local   # Add OPENAI_API_KEY for translation
docker compose up
```

App runs at [http://localhost:3000](http://localhost:3000). Whisper model downloads automatically on first start.

Data is stored in `/data` (SQLite database + downloaded audio files + whisper model).
