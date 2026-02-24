import { NextResponse } from "next/server";
import { db } from "@/db";
import { episodes, transcriptions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { transcribeEpisode } from "@/lib/transcription-service";

export async function POST(request: Request) {
  const { episodeId } = await request.json();

  // Validate episode exists and is downloaded
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }
  if (!episode.filePath) {
    return NextResponse.json({ error: "Episode not downloaded" }, { status: 400 });
  }

  // Check for existing pending/in_progress transcription
  const [existing] = await db.select().from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (existing) {
    if (existing.status === "pending" || existing.status === "in_progress") {
      return NextResponse.json({ error: "Transcription already in progress" }, { status: 409 });
    }
    // Delete failed transcription to allow retry
    if (existing.status === "failed") {
      await db.delete(transcriptions).where(eq(transcriptions.id, existing.id));
    }
    // If completed, don't re-transcribe
    if (existing.status === "completed") {
      return NextResponse.json({ error: "Transcription already exists" }, { status: 409 });
    }
  }

  // Insert new transcription
  const [row] = await db.insert(transcriptions)
    .values({ episodeId, status: "pending" })
    .returning();

  // Fire-and-forget
  transcribeEpisode(row.id, episodeId).catch(console.error);

  return NextResponse.json({ id: row.id }, { status: 202 });
}

// GET: batch fetch statuses for multiple episodes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const episodeIds = searchParams.get("episodeIds")?.split(",").filter(Boolean);

  if (!episodeIds?.length) {
    return NextResponse.json([]);
  }

  const rows = await db.select({
    id: transcriptions.id,
    episodeId: transcriptions.episodeId,
    status: transcriptions.status,
    errorMessage: transcriptions.errorMessage,
  }).from(transcriptions)
    .where(inArray(transcriptions.episodeId, episodeIds));

  return NextResponse.json(rows);
}
