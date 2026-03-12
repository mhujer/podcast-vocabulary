import { db } from "@/db";
import { podcasts, episodes, playbackSettings } from "@/db/schema";
import { eq, ne, and, isNull, not } from "drizzle-orm";
import { parseFeed } from "./rss";
import { downloadAudio } from "./download";
import { existsSync, unlinkSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { AUDIO_DIR } from "@/db";

export async function addPodcast(rssUrl: string) {
  const feed = await parseFeed(rssUrl);

  const [podcast] = await db
    .insert(podcasts)
    .values({
      name: feed.title,
      rssUrl,
      imageUrl: feed.imageUrl || null,
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

  return podcast;
}

export async function refreshAllFeeds() {
  const allPodcasts = await db.select().from(podcasts).where(ne(podcasts.type, "collection"));

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

      // Update latest episode date and image
      const updateFields: Record<string, string> = {};
      if (feed.episodes[0]?.pubDate) {
        updateFields.latestEpisodeDate = feed.episodes[0].pubDate;
      }
      if (feed.imageUrl) {
        updateFields.imageUrl = feed.imageUrl;
      }
      if (Object.keys(updateFields).length > 0) {
        await db
          .update(podcasts)
          .set(updateFields)
          .where(eq(podcasts.id, podcast.id));
      }

      // Filesystem sync: clear filePath for missing files, remove orphans
      const epsWithFiles = await db
        .select({ id: episodes.id, filePath: episodes.filePath })
        .from(episodes)
        .where(and(eq(episodes.podcastId, podcast.id), not(isNull(episodes.filePath))));

      const referencedFiles = new Set<string>();
      for (const ep of epsWithFiles) {
        if (ep.filePath && !existsSync(ep.filePath)) {
          console.log(`Clearing missing filePath for episode ${ep.id}: ${ep.filePath}`);
          await db.update(episodes).set({ filePath: null }).where(eq(episodes.id, ep.id));
        } else if (ep.filePath) {
          referencedFiles.add(ep.filePath);
        }
      }

      // Remove orphan audio files not referenced by any episode
      const podcastAudioDir = join(AUDIO_DIR, podcast.id);
      if (existsSync(podcastAudioDir)) {
        const files = readdirSync(podcastAudioDir);
        for (const file of files) {
          const fullPath = join(podcastAudioDir, file);
          if (!referencedFiles.has(fullPath)) {
            console.log(`Removing orphan audio file: ${fullPath}`);
            try {
              unlinkSync(fullPath);
            } catch {
              // file may already be gone
            }
          }
        }
        // Clean up empty directory
        const remaining = readdirSync(podcastAudioDir);
        if (remaining.length === 0) {
          rmSync(podcastAudioDir, { recursive: true, force: true });
        }
      }
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

  // Remove the podcast audio subdirectory
  try {
    rmSync(join(AUDIO_DIR, id), { recursive: true, force: true });
  } catch {
    // directory may already be gone
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

  const filePath = await downloadAudio(episode.audioUrl, episodeId, episode.podcastId);
  await db.update(episodes).set({ filePath }).where(eq(episodes.id, episodeId));
  return filePath;
}
