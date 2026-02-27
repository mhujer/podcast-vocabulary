import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const AUDIO_DIR = join(DATA_DIR, "audio");
const DB_PATH = join(DATA_DIR, "podcasts.db");

mkdirSync(AUDIO_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { DATA_DIR, AUDIO_DIR, DB_PATH, sqlite };
