import { NextResponse } from "next/server";
import { refreshAllFeeds } from "@/lib/podcast-service";

export async function POST() {
  try {
    // Fire-and-forget — return immediately
    refreshAllFeeds().catch(console.error);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
