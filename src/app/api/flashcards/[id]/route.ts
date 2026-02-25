import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flashcards } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates: Partial<{ front: string; back: string }> = {};

  if (body.front !== undefined) updates.front = body.front;
  if (body.back !== undefined) updates.back = body.back;

  const [card] = await db
    .update(flashcards)
    .set(updates)
    .where(eq(flashcards.id, id))
    .returning();

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(card);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(flashcards).where(eq(flashcards.id, id));
  return NextResponse.json({ ok: true });
}
