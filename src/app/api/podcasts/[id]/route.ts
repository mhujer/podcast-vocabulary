import { NextRequest, NextResponse } from "next/server";
import { deletePodcast } from "@/lib/podcast-service";
import { writeOpmlFile } from "@/lib/opml";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deletePodcast(id);
    writeOpmlFile().catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
