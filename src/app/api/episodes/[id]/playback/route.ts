import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { episodes, playbackSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = parseInt(id, 10);

  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, episodeId));

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const [settings] = await db
    .select()
    .from(playbackSettings)
    .where(eq(playbackSettings.podcastId, episode.podcastId));

  return NextResponse.json({
    position: episode.lastPlaybackPosition || 0,
    speed: settings?.playbackSpeed || 1.0,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = parseInt(id, 10);
  const body = await request.json();

  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, episodeId));

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  if (body.position !== undefined) {
    await db
      .update(episodes)
      .set({
        lastPlaybackPosition: body.position,
        lastPlayedDate: new Date().toISOString(),
      })
      .where(eq(episodes.id, episodeId));
  }

  if (body.speed !== undefined) {
    await db
      .insert(playbackSettings)
      .values({ podcastId: episode.podcastId, playbackSpeed: body.speed })
      .onConflictDoUpdate({
        target: playbackSettings.podcastId,
        set: { playbackSpeed: body.speed },
      });
  }

  return NextResponse.json({ success: true });
}
