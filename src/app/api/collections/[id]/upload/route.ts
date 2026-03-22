import { NextRequest, NextResponse } from "next/server";
import { db, AUDIO_DIR } from "@/db";
import { podcasts, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { parseYouTubeVideoId } from "@/lib/youtube";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [podcast] = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, id));

  if (!podcast) {
    return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
  }
  if (podcast.type !== "collection") {
    return NextResponse.json(
      { error: "Upload only supported for collections" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string) || undefined;
  const youtubeUrl = formData.get("youtubeUrl") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let youtubeVideoId: string | null = null;
  if (youtubeUrl) {
    youtubeVideoId = parseYouTubeVideoId(youtubeUrl);
    if (!youtubeVideoId) {
      return NextResponse.json({ error: "Invalid YouTube URL or video ID" }, { status: 400 });
    }
  }

  const episodeId = crypto.randomUUID();
  const ext = extname(file.name) || ".mp3";
  const dir = join(AUDIO_DIR, id);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${episodeId}${ext}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
  console.log(`Uploaded file saved: ${filePath} (${buffer.length} bytes)`);

  const episodeTitle =
    title || file.name.replace(/\.[^.]+$/, "");

  const [episode] = await db
    .insert(episodes)
    .values({
      id: episodeId,
      podcastId: id,
      title: episodeTitle,
      filePath,
      pubDate: new Date().toISOString(),
      youtubeVideoId,
    })
    .returning();

  return NextResponse.json(episode);
}
