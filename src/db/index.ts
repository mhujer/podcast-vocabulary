import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const AUDIO_DIR = join(DATA_DIR, "audio");
const DB_PATH = join(DATA_DIR, "podcasts.db");

// Ensure directories exist
mkdirSync(AUDIO_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { DATA_DIR, AUDIO_DIR, DB_PATH };

// Mark interrupted transcriptions as failed on startup
sqlite.prepare(
  `UPDATE transcriptions SET status = 'failed', error_message = 'Transcription was interrupted by app restart' WHERE status = 'in_progress'`
).run();

// Mark interrupted translations as failed on startup
sqlite.prepare(
  `UPDATE transcriptions SET translation_status = 'failed', translation_error = 'Translation was interrupted by app restart' WHERE translation_status = 'in_progress'`
).run();

// Backfill translations for completed transcriptions that haven't been translated
async function backfillTranslations() {
  const { translateSegments } = await import("@/lib/translation-service");
  const rows = sqlite.prepare(
    `SELECT id FROM transcriptions WHERE status = 'completed' AND (translation_status IS NULL OR translation_status = 'failed')`
  ).all() as { id: string }[];

  if (rows.length === 0) return;
  console.log(`[db] backfilling translations for ${rows.length} transcriptions`);

  for (const row of rows) {
    // Update status to pending before starting
    sqlite.prepare(
      `UPDATE transcriptions SET translation_status = 'pending' WHERE id = ?`
    ).run(row.id);

    // Sequential to avoid rate limits
    try {
      await translateSegments(row.id);
    } catch (err) {
      console.error(`[db] backfill translation failed for ${row.id}:`, err);
    }
  }
}

backfillTranslations().catch(console.error);

// Seed from OPML if the podcasts table is empty
const podcastCount = sqlite.prepare("SELECT COUNT(*) as count FROM podcasts").get() as { count: number } | undefined;
if (podcastCount && podcastCount.count === 0) {
  import("@/lib/opml").then(({ importFromOpml }) => {
    importFromOpml().catch(console.error);
  }).catch(() => {
    // OPML module not available yet (e.g. during build)
  });
}
