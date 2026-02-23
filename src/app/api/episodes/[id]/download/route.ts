import { NextRequest, NextResponse } from "next/server";
import { downloadEpisode } from "@/lib/podcast-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = await downloadEpisode(id);
    return NextResponse.json({ filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
