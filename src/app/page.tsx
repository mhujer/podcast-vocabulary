import { db } from "@/db";
import { podcasts, episodes } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { PodcastList } from "@/components/podcast-list";
import { AddPodcastDialog } from "@/components/add-podcast-dialog";
import { CreateCollectionDialog } from "@/components/create-collection-dialog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await db
    .select({
      id: podcasts.id,
      name: podcasts.name,
      type: podcasts.type,
      rssUrl: podcasts.rssUrl,
      imageUrl: podcasts.imageUrl,
      latestEpisodeDate: podcasts.latestEpisodeDate,
      createdAt: podcasts.createdAt,
      episodeCount: count(episodes.id),
    })
    .from(podcasts)
    .leftJoin(episodes, eq(episodes.podcastId, podcasts.id))
    .groupBy(podcasts.id)
    .orderBy(desc(podcasts.createdAt));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Podcasts</h1>
        <div className="flex gap-2">
          <CreateCollectionDialog />
          <AddPodcastDialog />
        </div>
      </div>
      <PodcastList podcasts={result} />
    </main>
  );
}
