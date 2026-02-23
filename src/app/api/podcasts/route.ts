import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { podcasts, episodes } from "@/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { addPodcast } from "@/lib/podcast-service";

export async function GET() {
  const result = await db
    .select({
      id: podcasts.id,
      name: podcasts.name,
      rssUrl: podcasts.rssUrl,
      latestEpisodeDate: podcasts.latestEpisodeDate,
      createdAt: podcasts.createdAt,
      episodeCount: count(episodes.id),
    })
    .from(podcasts)
    .leftJoin(episodes, eq(episodes.podcastId, podcasts.id))
    .groupBy(podcasts.id)
    .orderBy(desc(podcasts.createdAt));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  try {
    const { rssUrl } = await request.json();
    if (!rssUrl || typeof rssUrl !== "string") {
      return NextResponse.json({ error: "rssUrl is required" }, { status: 400 });
    }

    const podcast = await addPodcast(rssUrl);
    return NextResponse.json(podcast, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
