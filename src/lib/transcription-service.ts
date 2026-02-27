import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { readFileSync, mkdirSync, rmSync, existsSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { transcriptions, episodes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { TranscriptionSegment, TranscriptionWord } from "@/types/transcription";
import { DATA_DIR } from "@/db";
import { translateSegments } from "@/lib/translation-service";

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

// --- DB-driven sequential transcription queue ---
let processing = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function enqueueTranscription(_transcriptionId: string, _episodeId: string) {
  // DB row already inserted by the API route with status='pending'.
  // Just kick the processing loop.
  log("enqueue called, triggering processing");
  triggerProcessing();
}

export function triggerProcessing() {
  if (processing) {
    log("triggerProcessing: already processing, skipping");
    return;
  }
  processing = true;
  log("triggerProcessing: starting processLoop");
  processLoop().finally(() => {
    processing = false;
    log("processLoop finished, processing flag reset");
  });
}

async function processLoop() {
  while (true) {
    // Pick the oldest pending transcription by rowid (FIFO)
    const [next] = await db
      .select({ id: transcriptions.id, episodeId: transcriptions.episodeId })
      .from(transcriptions)
      .where(eq(transcriptions.status, "pending"))
      .orderBy(sql`rowid`)
      .limit(1);

    if (!next) {
      log("no more pending transcriptions, stopping loop");
      break;
    }

    log("processing next from DB", { transcriptionId: next.id, episodeId: next.episodeId });
    try {
      await transcribeEpisode(next.id, next.episodeId);
    } catch (err) {
      // Catch unexpected errors so the loop continues with remaining items
      const message = err instanceof Error ? err.message : String(err);
      log("unexpected error in processLoop iteration:", message);
      try {
        await db.update(transcriptions)
          .set({ status: "failed", errorMessage: message })
          .where(eq(transcriptions.id, next.id));
      } catch (dbErr) {
        log("failed to mark transcription as failed in DB:", dbErr);
      }
    }
  }
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
      "-pp",
      "-debug",
      "-of", outputBase,
    ];
    log("running whisper-cli with args:", whisperArgs.join(" "));

    // Log compressed WAV size to help correlate OOM kills with audio size
    const wavStat = statSync(compressedPath);
    log("compressed WAV size:", (wavStat.size / 1024 / 1024).toFixed(1), "MB");

    const startTime = Date.now();
    log("whisper started at:", new Date(startTime).toISOString());

    await new Promise<void>((resolve, reject) => {
      const child = spawn("whisper-cli", whisperArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderrBuf = "";

      child.stdout.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n")) {
          if (line.trim()) log("[whisper stdout]", line);
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderrBuf += chunk;
        for (const line of chunk.split("\n")) {
          if (line.trim()) log("[whisper stderr]", line);
        }
      });

      child.on("close", (code, signal) => {
        log("whisper-cli exited, code:", code, "signal:", signal);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `whisper-cli failed (code ${code}, signal ${signal}): ${stderrBuf.slice(0, 2000)}`
          ));
        }
      });

      child.on("error", (err) => {
        log("whisper-cli spawn error:", err.message);
        reject(err);
      });
    });

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
        translationStatus: "pending",
      })
      .where(eq(transcriptions.id, transcriptionId));

    // Auto-trigger translation (fire-and-forget)
    log("auto-triggering translation for", transcriptionId);
    translateSegments(transcriptionId).catch((err) =>
      log("translation auto-trigger error:", err)
    );
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
