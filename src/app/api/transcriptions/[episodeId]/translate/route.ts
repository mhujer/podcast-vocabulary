import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const [row] = await db.select().from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (!row) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  if (row.status !== "completed") {
    return NextResponse.json({ error: "Transcription not completed yet" }, { status: 400 });
  }

  if (row.translationStatus === "in_progress") {
    return NextResponse.json({ error: "Translation already in progress" }, { status: 409 });
  }

  // Set to pending — worker will pick it up
  await db.update(transcriptions)
    .set({ translationStatus: "pending", translationError: null })
    .where(eq(transcriptions.id, row.id));

  return NextResponse.json({ status: "pending" }, { status: 202 });
}
