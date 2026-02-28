import { db } from "@/db";
import { podcasts, episodes, transcriptions } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EpisodeList } from "@/components/episode-list";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { UploadDialog } from "@/components/upload-dialog";

export const dynamic = "force-dynamic";

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [podcast] = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, id));

  if (!podcast) notFound();

  // Total episode count
  const [{ total }] = await db
    .select({ total: count() })
    .from(episodes)
    .where(eq(episodes.podcastId, id));

  // Last 50 by date
  const recent = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.pubDate))
    .limit(50);

  const recentIds = new Set(recent.map((e) => e.id));

  // Older episodes that are downloaded or transcribed
  const transcribedEpisodeIds = await db
    .select({ episodeId: transcriptions.episodeId })
    .from(transcriptions);
  const transcribedSet = new Set(transcribedEpisodeIds.map((r) => r.episodeId));

  const olderDownloadedOrTranscribed = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.pubDate))
    .then((rows) =>
      rows.filter(
        (e) =>
          !recentIds.has(e.id) &&
          (e.filePath !== null || transcribedSet.has(e.id))
      )
    );

  // Merge and sort by pubDate DESC
  const episodeList = [...recent, ...olderDownloadedOrTranscribed].sort(
    (a, b) => {
      const da = a.pubDate ?? "";
      const db_ = b.pubDate ?? "";
      return db_.localeCompare(da);
    }
  );

  const showing = episodeList.length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to podcasts
      </Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">{podcast.name}</h1>
        {podcast.type === "collection" && (
          <UploadDialog collectionId={podcast.id} />
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {showing < total
          ? `Showing ${showing} of ${total} episodes`
          : `${total} episodes`}
      </p>
      <EpisodeList episodes={episodeList} podcast={podcast} />
    </main>
  );
}
