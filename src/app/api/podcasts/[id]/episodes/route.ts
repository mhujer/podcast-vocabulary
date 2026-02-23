import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.pubDate));

  return NextResponse.json(result);
}
