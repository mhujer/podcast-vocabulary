import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, id));

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json(episode);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (typeof body.done !== "boolean") {
    return NextResponse.json({ error: "done must be a boolean" }, { status: 400 });
  }

  const [updated] = await db
    .update(episodes)
    .set({ done: body.done })
    .where(eq(episodes.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  console.log(`[episode] Marked ${id} as done=${body.done}`);
  return NextResponse.json(updated);
}
