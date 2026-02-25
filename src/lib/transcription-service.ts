import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { transcriptions, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TranscriptionSegment, TranscriptionWord } from "@/types/transcription";
import { DATA_DIR } from "@/db";

const execFileAsync = promisify(execFile);
const TMP_DIR = join(DATA_DIR, "audio", "tmp");
const WHISPER_MODEL = join(DATA_DIR, "whisper", "ggml-medium.bin");

function log(...args: unknown[]) {
  console.log("[transcription-service]", ...args);
}

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
  log("start", { transcriptionId, episodeId });

  try {
    await db.update(transcriptions)
      .set({ status: "in_progress" })
      .where(eq(transcriptions.id, transcriptionId));

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode?.filePath) {
      throw new Error("Episode audio file not found");
    }
    log("audio file:", episode.filePath, "exists:", existsSync(episode.filePath));
    log("whisper model:", WHISPER_MODEL, "exists:", existsSync(WHISPER_MODEL));

    // Compress to mono 16kHz WAV for whisper.cpp
    log("compressing audio...");
    const compressedPath = await compressAudio(episode.filePath, episodeId);
    log("compressed to:", compressedPath, "exists:", existsSync(compressedPath));

    // Output file path (whisper-cli appends .json)
    const outputBase = join(tmpDir, "output");
    const whisperArgs = [
      "-m", WHISPER_MODEL,
      "-f", compressedPath,
      "-l", "de",
      "-ml", "1",
      "-oj",
      "-np",
      "-of", outputBase,
    ];
    log("running whisper-cli with args:", whisperArgs.join(" "));

    const startTime = Date.now();
    log("whisper started at:", new Date(startTime).toISOString());

    try {
      const { stdout, stderr } = await execFileAsync("whisper-cli", whisperArgs, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30 * 60 * 1000,
      });
      if (stdout) log("whisper stdout:", stdout.slice(0, 2000));
      if (stderr) log("whisper stderr:", stderr.slice(0, 2000));
    } catch (execError: unknown) {
      const e = execError as { stdout?: string; stderr?: string; code?: number; message?: string };
      log("whisper-cli failed, code:", e.code);
      if (e.stdout) log("whisper stdout:", e.stdout.slice(0, 2000));
      if (e.stderr) log("whisper stderr:", e.stderr.slice(0, 2000));
      throw new Error(`whisper-cli failed (code ${e.code}): ${e.stderr || e.message}`);
    }

    const endTime = Date.now();
    const durationSec = (endTime - startTime) / 1000;
    const durationMin = durationSec / 60;

    log("whisper finished at:", new Date(endTime).toISOString());
    log(`transcription took ${durationMin.toFixed(1)} min (${durationSec.toFixed(0)} sec)`);

    if (episode.duration != null) {
      const audioMin = episode.duration / 60;
      const ratio = durationMin / audioMin;
      log(`audio length: ${audioMin.toFixed(1)} min, ratio: ${ratio.toFixed(2)} min transcription per 1 min audio`);
    }

    // Parse JSON output
    const jsonPath = outputBase + ".json";
    log("reading output:", jsonPath, "exists:", existsSync(jsonPath));
    const raw = readFileSync(jsonPath, "utf-8");
    const whisperOutput: WhisperJsonOutput = JSON.parse(raw);

    const segments = groupWordsIntoSegments(whisperOutput.transcription);
    log("transcription complete, segments:", segments.length);

    await db.update(transcriptions)
      .set({
        status: "completed",
        segments: JSON.stringify(segments),
        transcribedAt: new Date().toISOString(),
      })
      .where(eq(transcriptions.id, transcriptionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR:", message);
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
