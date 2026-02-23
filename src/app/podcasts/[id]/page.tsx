import { db } from "@/db";
import { podcasts, episodes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EpisodeList } from "@/components/episode-list";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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

  const episodeList = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.pubDate));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to podcasts
      </Link>
      <h1 className="text-2xl font-bold mb-1">{podcast.name}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {episodeList.length} episodes
      </p>
      <EpisodeList episodes={episodeList} podcast={podcast} />
    </main>
  );
}
