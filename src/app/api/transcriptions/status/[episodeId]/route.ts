import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const rows = await db.select({
    engine: transcriptions.engine,
    status: transcriptions.status,
    errorMessage: transcriptions.errorMessage,
    translationStatus: transcriptions.translationStatus,
  }).from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (rows.length === 0) {
    return NextResponse.json({ status: null });
  }

  // Return array of statuses per engine
  return NextResponse.json(rows);
}
