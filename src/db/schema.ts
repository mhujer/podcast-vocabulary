import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import type { InferSelectModel } from "drizzle-orm";

export const podcasts = sqliteTable("podcasts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  rssUrl: text("rss_url").notNull(),
  latestEpisodeDate: text("latest_episode_date"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const episodes = sqliteTable("episodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  podcastId: text("podcast_id")
    .notNull()
    .references(() => podcasts.id, { onDelete: "cascade" }),
  guid: text("guid"),
  title: text("title").notNull(),
  description: text("description"),
  audioUrl: text("audio_url").notNull(),
  pubDate: text("pub_date"),
  duration: integer("duration"),
  filePath: text("file_path"),
  lastPlaybackPosition: real("last_playback_position"),
  lastPlayedDate: text("last_played_date"),
});

export const transcriptions = sqliteTable("transcriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  segments: text("segments"), // JSON array of {start_time, end_time, text}
  transcribedAt: text("transcribed_at"),
  status: text("status").notNull().default("pending"), // pending | in_progress | completed | failed
  errorMessage: text("error_message"),
});

export const playbackSettings = sqliteTable("playback_settings", {
  podcastId: text("podcast_id")
    .primaryKey()
    .references(() => podcasts.id, { onDelete: "cascade" }),
  playbackSpeed: real("playback_speed").notNull().default(1.0),
});

export const flashcards = sqliteTable("flashcards", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  segmentIndex: integer("segment_index").notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  selectedText: text("selected_text").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Podcast = InferSelectModel<typeof podcasts>;
export type Episode = InferSelectModel<typeof episodes>;
export type Transcription = InferSelectModel<typeof transcriptions>;
export type PlaybackSettings = InferSelectModel<typeof playbackSettings>;
export type Flashcard = InferSelectModel<typeof flashcards>;
