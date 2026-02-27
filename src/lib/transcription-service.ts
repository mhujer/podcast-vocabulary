import { spawn } from "child_process";
import { promisify } from "util";
import { execFile } from "child_process";
import { readFileSync, mkdirSync, rmSync, existsSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { transcriptions, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TranscriptionSegment, TranscriptionWord } from "@/types/transcription";
import { DATA_DIR } from "@/db";

const execFileAsync = promisify(execFile);
const TMP_DIR = join(DATA_DIR, "audio", "tmp");
const WHISPER_MODEL = join(DATA_DIR, "whisper", "ggml-medium.bin");

export type TranscriptionEngine = "whisper" | "parakeet";

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

async function runWhisper(compressedPath: string, tmpDir: string): Promise<WhisperJsonOutput> {
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

  const jsonPath = outputBase + ".json";
  log("reading output:", jsonPath, "exists:", existsSync(jsonPath));
  const raw = readFileSync(jsonPath, "utf-8");
  return JSON.parse(raw);
}

async function runParakeet(compressedPath: string, tmpDir: string): Promise<WhisperJsonOutput> {
  const outputPath = join(tmpDir, "parakeet-output.json");
  const args = ["/usr/local/bin/parakeet-transcribe.py", compressedPath, outputPath];
  log("running parakeet with args:", args.join(" "));

  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HF_HOME: join(DATA_DIR, "parakeet") },
    });

    let stderrBuf = "";

    child.stdout.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) log("[parakeet stdout]", line);
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderrBuf += chunk;
      for (const line of chunk.split("\n")) {
        if (line.trim()) log("[parakeet stderr]", line);
      }
    });

    child.on("close", (code, signal) => {
      log("parakeet exited, code:", code, "signal:", signal);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(
          `parakeet failed (code ${code}, signal ${signal}): ${stderrBuf.slice(0, 2000)}`
        ));
      }
    });

    child.on("error", (err) => {
      log("parakeet spawn error:", err.message);
      reject(err);
    });
  });

  log("reading output:", outputPath, "exists:", existsSync(outputPath));
  const raw = readFileSync(outputPath, "utf-8");
  return JSON.parse(raw);
}

export async function transcribeEpisode(
  transcriptionId: string,
  episodeId: string,
  engine: TranscriptionEngine = "whisper"
): Promise<void> {
  const tmpDir = join(TMP_DIR, episodeId);
  log("start", { transcriptionId, episodeId, engine });

  try {
    await db.update(transcriptions)
      .set({ status: "in_progress" })
      .where(eq(transcriptions.id, transcriptionId));

    const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
    if (!episode?.filePath) {
      throw new Error("Episode audio file not found");
    }
    log("audio file:", episode.filePath, "exists:", existsSync(episode.filePath));

    // Compress to mono 16kHz WAV (shared by both engines)
    log("compressing audio...");
    const compressedPath = await compressAudio(episode.filePath, episodeId);
    log("compressed to:", compressedPath, "exists:", existsSync(compressedPath));

    const wavStat = statSync(compressedPath);
    log("compressed WAV size:", (wavStat.size / 1024 / 1024).toFixed(1), "MB");

    const startTime = Date.now();
    log(`${engine} started at:`, new Date(startTime).toISOString());

    // Run the selected engine
    const whisperOutput = engine === "parakeet"
      ? await runParakeet(compressedPath, tmpDir)
      : await runWhisper(compressedPath, tmpDir);

    const endTime = Date.now();
    const durationSec = (endTime - startTime) / 1000;
    const durationMin = durationSec / 60;

    log(`${engine} finished at:`, new Date(endTime).toISOString());
    log(`transcription took ${durationMin.toFixed(1)} min (${durationSec.toFixed(0)} sec)`);

    if (episode.duration != null) {
      const audioMin = episode.duration / 60;
      const ratio = durationMin / audioMin;
      log(`audio length: ${audioMin.toFixed(1)} min, ratio: ${ratio.toFixed(2)} min transcription per 1 min audio`);
    }

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
