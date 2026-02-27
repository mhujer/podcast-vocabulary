import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const rows = await db.select().from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Transcription not found" }, { status: 404 });
  }

  const result = rows.map((row) => ({
    ...row,
    segments: row.segments ? JSON.parse(row.segments) : null,
    translations: row.translations ? JSON.parse(row.translations) : null,
  }));

  return NextResponse.json(result);
}
