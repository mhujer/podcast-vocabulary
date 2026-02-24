import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const [row] = await db.select().from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (!row) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...row,
    segments: row.segments ? JSON.parse(row.segments) : null,
  });
}
