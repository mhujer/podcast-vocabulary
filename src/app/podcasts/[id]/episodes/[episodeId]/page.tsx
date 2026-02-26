import { db } from "@/db";
import { podcasts, episodes, transcriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EpisodeActions } from "@/components/episode-actions";
import { EpisodeTranscript } from "@/components/episode-transcript";
import { CollapsibleDescription } from "@/components/collapsible-description";
import { SidebarPlayer } from "@/components/sidebar-player";

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
    <main className="flex h-screen">
      <aside className="w-72 shrink-0 border-r overflow-y-auto p-4 space-y-4">
        <Link
          href={`/podcasts/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to {podcast.name}
        </Link>

        <h1 className="text-lg font-bold">{episode.title}</h1>
        <p className="text-sm text-muted-foreground">
          {episode.pubDate && new Date(episode.pubDate).toLocaleDateString()}
          {episode.duration && <> &middot; {formatDuration(episode.duration)}</>}
        </p>

        <EpisodeActions
          episode={episode}
          podcast={podcast}
          transcriptionStatus={transcription?.status ?? null}
        />

        <SidebarPlayer />

        {episode.description && (
          <CollapsibleDescription html={episode.description} />
        )}
      </aside>

      <div className="flex-1 min-w-0 overflow-hidden">
        <EpisodeTranscript episodeId={episodeId} podcastName={podcast.name} episodeTitle={episode.title} />
      </div>
    </main>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
