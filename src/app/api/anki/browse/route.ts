import { NextRequest, NextResponse } from "next/server";

const ANKI_CONNECT_URL = "http://host.docker.internal:8765";

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  console.log(`[anki] guiBrowse query="${query}"`);

  try {
    const res = await fetch(ANKI_CONNECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "guiBrowse",
        version: 6,
        params: { query },
      }),
    });

    const data = await res.json();
    console.log(`[anki] guiBrowse result:`, data);
    return NextResponse.json(data);
  } catch (err) {
    console.log(`[anki] AnkiConnect unavailable: ${err}`);
    return NextResponse.json(
      { error: `AnkiConnect unavailable: ${err}` },
      { status: 502 }
    );
  }
}
