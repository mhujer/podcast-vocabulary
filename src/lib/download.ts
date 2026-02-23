import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { join } from "path";
import { AUDIO_DIR } from "@/db";

export async function downloadAudio(
  audioUrl: string,
  episodeId: string
): Promise<string> {
  const ext = extractExtension(audioUrl);
  const filename = `${episodeId}.${ext}`;
  const filePath = join(AUDIO_DIR, filename);

  const response = await fetch(audioUrl);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download audio: ${response.status} ${response.statusText}`
    );
  }

  const nodeStream = response.body as unknown as NodeJS.ReadableStream;
  await pipeline(nodeStream, createWriteStream(filePath));

  return filePath;
}

function extractExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["mp3", "m4a", "ogg", "wav", "aac", "opus"].includes(ext)) {
      return ext;
    }
  } catch {
    // ignore URL parse errors
  }
  return "mp3";
}
