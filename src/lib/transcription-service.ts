import { execFile } from "child_process";
import { promisify } from "util";
import { createReadStream, statSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { db } from "@/db";
import { transcriptions, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TranscriptionSegment } from "@/types/transcription";
import { DATA_DIR } from "@/db";

const execFileAsync = promisify(execFile);
const TMP_DIR = join(DATA_DIR, "audio", "tmp");
const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB

const openai = new OpenAI();

async function compressAudio(inputPath: string, episodeId: string): Promise<string> {
  const outDir = join(TMP_DIR, episodeId);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "compressed.mp3");
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath,
    "-ac", "1", "-ar", "16000", "-b:a", "32k",
    outPath,
  ]);
  return outPath;
}

interface AudioChunk {
  path: string;
  offsetSeconds: number;
}

async function getDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function splitAudio(compressedPath: string, episodeId: string): Promise<AudioChunk[]> {
  const size = statSync(compressedPath).size;
  if (size <= MAX_CHUNK_SIZE) {
    return [{ path: compressedPath, offsetSeconds: 0 }];
  }

  const duration = await getDuration(compressedPath);
  const numChunks = Math.ceil(size / MAX_CHUNK_SIZE);
  const chunkDuration = duration / numChunks;
  const chunks: AudioChunk[] = [];
  const outDir = join(TMP_DIR, episodeId);

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const outPath = join(outDir, `chunk_${i}.mp3`);
    await execFileAsync("ffmpeg", [
      "-y", "-i", compressedPath,
      "-ss", String(start), "-t", String(chunkDuration),
      "-c", "copy",
      outPath,
    ]);
    chunks.push({ path: outPath, offsetSeconds: start });
  }
  return chunks;
}

async function transcribeChunk(chunkPath: string): Promise<TranscriptionSegment[]> {
  const response = await openai.audio.transcriptions.create({
    file: createReadStream(chunkPath),
    model: "whisper-1",
    language: "de",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  return (response.segments ?? []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text,
  }));
}

export async function transcribeEpisode(transcriptionId: string, episodeId: string): Promise<void> {
  const tmpDir = join(TMP_DIR, episodeId);

  try {
    // Set status to in_progress
    await db.update(transcriptions)
      .set({ status: "in_progress" })
      .where(eq(transcriptions.id, transcriptionId));

    // Get episode to find audio file
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode?.filePath) {
      throw new Error("Episode audio file not found");
    }

    // Compress
    const compressedPath = await compressAudio(episode.filePath, episodeId);

    // Split if needed
    const chunks = await splitAudio(compressedPath, episodeId);

    // Transcribe each chunk and stitch
    const allSegments: TranscriptionSegment[] = [];
    for (const chunk of chunks) {
      const segments = await transcribeChunk(chunk.path);
      for (const seg of segments) {
        allSegments.push({
          start: seg.start + chunk.offsetSeconds,
          end: seg.end + chunk.offsetSeconds,
          text: seg.text,
        });
      }
    }

    // Save
    await db.update(transcriptions)
      .set({
        status: "completed",
        segments: JSON.stringify(allSegments),
        transcribedAt: new Date().toISOString(),
      })
      .where(eq(transcriptions.id, transcriptionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(transcriptions)
      .set({ status: "failed", errorMessage: message })
      .where(eq(transcriptions.id, transcriptionId));
  } finally {
    // Clean up temp files
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
