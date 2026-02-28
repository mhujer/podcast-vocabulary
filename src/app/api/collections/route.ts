import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { podcasts, playbackSettings } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const [collection] = await db
      .insert(podcasts)
      .values({
        name,
        type: "collection",
      })
      .returning();

    await db
      .insert(playbackSettings)
      .values({ podcastId: collection.id })
      .onConflictDoNothing();

    console.log(`Created collection: ${collection.id} "${name}"`);
    return NextResponse.json(collection, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
