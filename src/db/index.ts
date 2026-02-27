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

// Guard startup side-effects so HMR re-evaluation doesn't re-run them
declare global {
  var __dbInitialized: boolean | undefined;
}

if (!globalThis.__dbInitialized) {
  globalThis.__dbInitialized = true;

  // Seed from OPML if the podcasts table is empty
  const podcastCount = sqlite.prepare("SELECT COUNT(*) as count FROM podcasts").get() as { count: number } | undefined;
  if (podcastCount && podcastCount.count === 0) {
    import("@/lib/opml").then(({ importFromOpml }) => {
      importFromOpml().catch(console.error);
    }).catch(() => {
      // OPML module not available yet (e.g. during build)
    });
  }
}
