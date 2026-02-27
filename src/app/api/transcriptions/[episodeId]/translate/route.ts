import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { translateSegments } from "@/lib/translation-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const { engine = "whisper" } = await request.json().catch(() => ({ engine: "whisper" }));

  const [row] = await db.select().from(transcriptions)
    .where(and(eq(transcriptions.episodeId, episodeId), eq(transcriptions.engine, engine)));

  if (!row) {
    return NextResponse.json({ error: `Transcription not found for engine: ${engine}` }, { status: 404 });
  }

  if (row.status !== "completed") {
    return NextResponse.json({ error: "Transcription not completed yet" }, { status: 400 });
  }

  if (row.translationStatus === "in_progress") {
    return NextResponse.json({ error: "Translation already in progress" }, { status: 409 });
  }

  // Reset status to pending
  await db.update(transcriptions)
    .set({ translationStatus: "pending", translationError: null })
    .where(eq(transcriptions.id, row.id));

  // Fire-and-forget
  translateSegments(row.id).catch((err) =>
    console.error("[translate-route] translation error:", err)
  );

  return NextResponse.json({ status: "pending" }, { status: 202 });
}
