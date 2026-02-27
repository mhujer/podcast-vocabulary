import { NextResponse } from "next/server";
import { db } from "@/db";
import { episodes, transcriptions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { transcribeEpisode } from "@/lib/transcription-service";
import type { TranscriptionEngine } from "@/lib/transcription-service";

export async function POST(request: Request) {
  const { episodeId, engine = "whisper" } = await request.json() as {
    episodeId: string;
    engine?: TranscriptionEngine;
  };
  console.log("[transcriptions/POST] episodeId:", episodeId, "engine:", engine);

  if (engine !== "whisper" && engine !== "parakeet" && engine !== "canary") {
    return NextResponse.json({ error: `Invalid engine: ${engine}` }, { status: 400 });
  }

  // Validate episode exists and is downloaded
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!episode) {
    console.log("[transcriptions/POST] episode not found");
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }
  if (!episode.filePath) {
    console.log("[transcriptions/POST] episode not downloaded, filePath:", episode.filePath);
    return NextResponse.json({ error: "Episode not downloaded" }, { status: 400 });
  }
  console.log("[transcriptions/POST] episode filePath:", episode.filePath);

  // Check for existing transcription for this (episodeId, engine) pair
  const [existing] = await db.select().from(transcriptions)
    .where(and(eq(transcriptions.episodeId, episodeId), eq(transcriptions.engine, engine)));

  if (existing) {
    console.log("[transcriptions/POST] existing transcription:", existing.id, "status:", existing.status, "engine:", engine);
    if (existing.status === "pending" || existing.status === "in_progress") {
      return NextResponse.json({ error: "Transcription already in progress" }, { status: 409 });
    }
    // Delete failed transcription to allow retry
    if (existing.status === "failed") {
      await db.delete(transcriptions).where(eq(transcriptions.id, existing.id));
      console.log("[transcriptions/POST] deleted failed transcription:", existing.id);
    }
    // If completed, don't re-transcribe
    if (existing.status === "completed") {
      return NextResponse.json({ error: "Transcription already exists" }, { status: 409 });
    }
  }

  // Insert new transcription
  const [row] = await db.insert(transcriptions)
    .values({ episodeId, engine, status: "pending" })
    .returning();
  console.log("[transcriptions/POST] created transcription:", row.id, "engine:", engine, "— starting transcribeEpisode");

  // Fire-and-forget
  transcribeEpisode(row.id, episodeId, engine).catch((err) =>
    console.error("[transcriptions/POST] transcribeEpisode unhandled error:", err)
  );

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
    engine: transcriptions.engine,
    status: transcriptions.status,
    errorMessage: transcriptions.errorMessage,
  }).from(transcriptions)
    .where(inArray(transcriptions.episodeId, episodeIds));

  return NextResponse.json(rows);
}
