import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { transcriptions, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TranscriptionSegment, TranscriptionWord } from "@/types/transcription";
import { DATA_DIR } from "@/db";

const execFileAsync = promisify(execFile);
const TMP_DIR = join(DATA_DIR, "audio", "tmp");
const WHISPER_MODEL = "/usr/local/share/whisper/ggml-medium.bin";

async function compressAudio(inputPath: string, episodeId: string): Promise<string> {
  const outDir = join(TMP_DIR, episodeId);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "compressed.wav");
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath,
    "-ac", "1", "-ar", "16000",
    outPath,
  ]);
  return outPath;
}

interface WhisperJsonSegment {
  offsets: { from: number; to: number };
  text: string;
}

interface WhisperJsonOutput {
  transcription: WhisperJsonSegment[];
}

function groupWordsIntoSegments(wordSegments: WhisperJsonSegment[]): TranscriptionSegment[] {
  if (wordSegments.length === 0) return [];

  const segments: TranscriptionSegment[] = [];
  let currentWords: TranscriptionWord[] = [];
  let segmentStart = 0;

  for (const ws of wordSegments) {
    const word: TranscriptionWord = {
      start: ws.offsets.from / 1000,
      end: ws.offsets.to / 1000,
      word: ws.text,
    };

    if (currentWords.length === 0) {
      segmentStart = word.start;
    }

    currentWords.push(word);

    // Split on sentence-ending punctuation
    const trimmed = ws.text.trim();
    if (trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")) {
      segments.push({
        start: segmentStart,
        end: word.end,
        text: currentWords.map((w) => w.word).join("").trim(),
        words: currentWords,
      });
      currentWords = [];
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    segments.push({
      start: segmentStart,
      end: currentWords[currentWords.length - 1].end,
      text: currentWords.map((w) => w.word).join("").trim(),
      words: currentWords,
    });
  }

  return segments;
}

export async function transcribeEpisode(transcriptionId: string, episodeId: string): Promise<void> {
  const tmpDir = join(TMP_DIR, episodeId);

  try {
    await db.update(transcriptions)
      .set({ status: "in_progress" })
      .where(eq(transcriptions.id, transcriptionId));

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode?.filePath) {
      throw new Error("Episode audio file not found");
    }

    // Compress to mono 16kHz WAV for whisper.cpp
    const compressedPath = await compressAudio(episode.filePath, episodeId);

    // Output file path (whisper-cli appends .json)
    const outputBase = join(tmpDir, "output");

    await execFileAsync("whisper-cli", [
      "-m", WHISPER_MODEL,
      "-f", compressedPath,
      "-l", "de",
      "-ml", "1",
      "-oj",
      "-np",
      "-of", outputBase,
    ], { maxBuffer: 50 * 1024 * 1024, timeout: 30 * 60 * 1000 });

    // Parse JSON output
    const jsonPath = outputBase + ".json";
    const raw = readFileSync(jsonPath, "utf-8");
    const whisperOutput: WhisperJsonOutput = JSON.parse(raw);

    const segments = groupWordsIntoSegments(whisperOutput.transcription);

    await db.update(transcriptions)
      .set({
        status: "completed",
        segments: JSON.stringify(segments),
        transcribedAt: new Date().toISOString(),
      })
      .where(eq(transcriptions.id, transcriptionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(transcriptions)
      .set({ status: "failed", errorMessage: message })
      .where(eq(transcriptions.id, transcriptionId));
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
