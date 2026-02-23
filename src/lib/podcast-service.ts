import { db } from "@/db";
import { podcasts, episodes, playbackSettings } from "@/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { parseFeed } from "./rss";
import { downloadAudio } from "./download";
import { unlinkSync, readdirSync } from "fs";
import { AUDIO_DIR } from "@/db";
import { join } from "path";

const MAX_CONCURRENT_DOWNLOADS = 3;
const AUTO_DOWNLOAD_COUNT = 10;

async function downloadWithConcurrency(
  tasks: Array<{ episodeId: string; audioUrl: string }>
) {
  const results: Array<{ episodeId: string; filePath?: string; error?: string }> = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = (async () => {
      try {
        const filePath = await downloadAudio(task.audioUrl, task.episodeId);
        await db
          .update(episodes)
          .set({ filePath })
          .where(eq(episodes.id, task.episodeId));
        results.push({ episodeId: task.episodeId, filePath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Download failed for episode ${task.episodeId}: ${message}`);
        results.push({ episodeId: task.episodeId, error: message });
      }
    })();

    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= MAX_CONCURRENT_DOWNLOADS) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
  return results;
}

export async function addPodcast(rssUrl: string) {
  const feed = await parseFeed(rssUrl);

  const [podcast] = await db
    .insert(podcasts)
    .values({
      name: feed.title,
      rssUrl,
      latestEpisodeDate: feed.episodes[0]?.pubDate || null,
    })
    .returning();

  const insertedEpisodes = [];
  for (const ep of feed.episodes) {
    const [inserted] = await db
      .insert(episodes)
      .values({
        podcastId: podcast.id,
        guid: ep.guid,
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audioUrl,
        pubDate: ep.pubDate,
        duration: ep.duration,
      })
      .returning();
    insertedEpisodes.push(inserted);
  }

  // Initialize playback settings
  await db.insert(playbackSettings).values({ podcastId: podcast.id }).onConflictDoNothing();

  // Fire-and-forget: download latest episodes
  const toDownload = insertedEpisodes.slice(0, AUTO_DOWNLOAD_COUNT).map((ep) => ({
    episodeId: ep.id,
    audioUrl: ep.audioUrl,
  }));
  downloadWithConcurrency(toDownload).catch(console.error);

  return podcast;
}

export async function refreshAllFeeds() {
  const allPodcasts = await db.select().from(podcasts);

  for (const podcast of allPodcasts) {
    try {
      const feed = await parseFeed(podcast.rssUrl);

      // Get existing episode identifiers
      const existingEpisodes = await db
        .select({ guid: episodes.guid, audioUrl: episodes.audioUrl })
        .from(episodes)
        .where(eq(episodes.podcastId, podcast.id));

      const existingGuids = new Set(existingEpisodes.map((e) => e.guid).filter(Boolean));
      const existingUrls = new Set(existingEpisodes.map((e) => e.audioUrl));

      const newEpisodes = feed.episodes.filter((ep) => {
        if (ep.guid && existingGuids.has(ep.guid)) return false;
        if (existingUrls.has(ep.audioUrl)) return false;
        return true;
      });

      const insertedNew = [];
      for (const ep of newEpisodes) {
        const [inserted] = await db
          .insert(episodes)
          .values({
            podcastId: podcast.id,
            guid: ep.guid,
            title: ep.title,
            description: ep.description,
            audioUrl: ep.audioUrl,
            pubDate: ep.pubDate,
            duration: ep.duration,
          })
          .returning();
        insertedNew.push(inserted);
      }

      // Update latest episode date
      if (feed.episodes[0]?.pubDate) {
        await db
          .update(podcasts)
          .set({ latestEpisodeDate: feed.episodes[0].pubDate })
          .where(eq(podcasts.id, podcast.id));
      }

      // Download latest un-downloaded episodes
      const allEps = await db
        .select()
        .from(episodes)
        .where(eq(episodes.podcastId, podcast.id))
        .orderBy(episodes.pubDate);

      // Sort newest first for download priority
      const sortedEps = [...allEps].sort((a, b) => {
        if (!a.pubDate || !b.pubDate) return 0;
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      });

      const toDownload = sortedEps
        .filter((ep) => !ep.filePath)
        .slice(0, AUTO_DOWNLOAD_COUNT)
        .map((ep) => ({ episodeId: ep.id, audioUrl: ep.audioUrl }));

      downloadWithConcurrency(toDownload).catch(console.error);
    } catch (err) {
      console.error(`Failed to refresh feed for podcast ${podcast.id}: ${err}`);
    }
  }
}

export async function deletePodcast(id: string) {
  // Get all episodes to clean up audio files
  const podcastEpisodes = await db
    .select({ filePath: episodes.filePath })
    .from(episodes)
    .where(eq(episodes.podcastId, id));

  // Delete audio files from disk
  for (const ep of podcastEpisodes) {
    if (ep.filePath) {
      try {
        unlinkSync(ep.filePath);
      } catch {
        // file may already be gone
      }
    }
  }

  // Cascade delete handles episodes, transcriptions, playback_settings
  await db.delete(podcasts).where(eq(podcasts.id, id));
}

export async function downloadEpisode(episodeId: string) {
  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, episodeId));

  if (!episode) throw new Error(`Episode ${episodeId} not found`);
  if (episode.filePath) return episode.filePath;

  const filePath = await downloadAudio(episode.audioUrl, episodeId);
  await db.update(episodes).set({ filePath }).where(eq(episodes.id, episodeId));
  return filePath;
}
