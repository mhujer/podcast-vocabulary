import { db } from "@/db";
import { podcasts, episodes, transcriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EpisodeActions } from "@/components/episode-actions";
import { EpisodeTranscript } from "@/components/episode-transcript";

export const dynamic = "force-dynamic";

export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ id: string; episodeId: string }>;
}) {
  const { id, episodeId } = await params;

  const [podcast] = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, id));

  if (!podcast) notFound();

  const [episode] = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.podcastId, id)));

  if (!episode) notFound();

  const [transcription] = await db
    .select()
    .from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href={`/podcasts/${id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to {podcast.name}
      </Link>

      <h1 className="text-2xl font-bold mb-1">{episode.title}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {episode.pubDate && new Date(episode.pubDate).toLocaleDateString()}
        {episode.duration && <> &middot; {formatDuration(episode.duration)}</>}
      </p>

      <EpisodeActions
        episode={episode}
        podcast={podcast}
        transcriptionStatus={transcription?.status ?? null}
      />

      {episode.description && (
        <div
          className="text-sm text-muted-foreground mt-4 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: episode.description }}
        />
      )}

      <EpisodeTranscript episodeId={episodeId} />
    </main>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
