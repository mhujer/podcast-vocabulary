import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const [row] = await db.select({
    status: transcriptions.status,
    errorMessage: transcriptions.errorMessage,
  }).from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId));

  if (!row) {
    return NextResponse.json({ status: null });
  }

  return NextResponse.json(row);
}
