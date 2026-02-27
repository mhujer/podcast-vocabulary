import { db, sqlite, DATA_DIR } from "./db";
import { transcriptions } from "@/db/schema";
import { eq, sql, and, isNull, or } from "drizzle-orm";
import { transcribeEpisode } from "@/lib/transcription-service";
import { translateSegments } from "@/lib/translation-service";

const POLL_INTERVAL_MS = 5000;

function log(...args: unknown[]) {
  console.log("[worker]", ...args);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function markInterrupted() {
  const transcriptionResult = sqlite.prepare(
    `UPDATE transcriptions SET status = 'failed', error_message = 'Interrupted by worker restart' WHERE status = 'in_progress'`
  ).run();
  if (transcriptionResult.changes > 0) {
    log(`marked ${transcriptionResult.changes} interrupted transcription(s) as failed`);
  }

  const translationResult = sqlite.prepare(
    `UPDATE transcriptions SET translation_status = 'failed', translation_error = 'Interrupted by worker restart' WHERE translation_status = 'in_progress'`
  ).run();
  if (translationResult.changes > 0) {
    log(`marked ${translationResult.changes} interrupted translation(s) as failed`);
  }
}

async function backfillTranslations() {
  const rows = await db
    .select({ id: transcriptions.id })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.status, "completed"),
        or(
          isNull(transcriptions.translationStatus),
          eq(transcriptions.translationStatus, "failed"),
        ),
      )
    );

  if (rows.length === 0) return;
  log(`backfilling translations for ${rows.length} transcription(s)`);

  for (const row of rows) {
    await db.update(transcriptions)
      .set({ translationStatus: "pending" })
      .where(eq(transcriptions.id, row.id));
  }
}

async function processNextTranscription(): Promise<boolean> {
  const [next] = await db
    .select({ id: transcriptions.id, episodeId: transcriptions.episodeId })
    .from(transcriptions)
    .where(eq(transcriptions.status, "pending"))
    .orderBy(sql`rowid`)
    .limit(1);

  if (!next) return false;

  log("transcribing", { transcriptionId: next.id, episodeId: next.episodeId });
  try {
    await transcribeEpisode(db, DATA_DIR, next.id, next.episodeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("unexpected transcription error:", message);
    try {
      await db.update(transcriptions)
        .set({ status: "failed", errorMessage: message })
        .where(eq(transcriptions.id, next.id));
    } catch (dbErr) {
      log("failed to mark transcription as failed:", dbErr);
    }
  }
  return true;
}

async function processNextTranslation(): Promise<boolean> {
  const [next] = await db
    .select({ id: transcriptions.id })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.status, "completed"),
        eq(transcriptions.translationStatus, "pending"),
      )
    )
    .orderBy(sql`rowid`)
    .limit(1);

  if (!next) return false;

  log("translating", { transcriptionId: next.id });
  try {
    await translateSegments(db, next.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("unexpected translation error:", message);
    try {
      await db.update(transcriptions)
        .set({ translationStatus: "failed", translationError: message })
        .where(eq(transcriptions.id, next.id));
    } catch (dbErr) {
      log("failed to mark translation as failed:", dbErr);
    }
  }
  return true;
}

async function run() {
  log("starting");
  markInterrupted();
  await backfillTranslations();

  while (true) {
    const didTranscribe = await processNextTranscription();
    if (didTranscribe) continue;

    const didTranslate = await processNextTranslation();
    if (didTranslate) continue;

    await sleep(POLL_INTERVAL_MS);
  }
}

run().catch(err => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
