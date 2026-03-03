import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join("data", "podcasts.db");
const BACKUP_DIR = path.join("data", "backups");

function escapeValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[backup] DB not found at ${DB_PATH}, skipping (first startup)`);
    process.exit(0);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // Get all table CREATE statements
  const tables = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string; sql: string }[];

  if (tables.length === 0) {
    console.log("[backup] No tables found, skipping");
    db.close();
    process.exit(0);
  }

  const lines: string[] = [];
  lines.push("-- Backup generated at " + new Date().toISOString());
  lines.push("PRAGMA foreign_keys = OFF;");
  lines.push("");

  for (const table of tables) {
    lines.push(`-- Table: ${table.name}`);
    lines.push(`DROP TABLE IF EXISTS ${table.name};`);
    lines.push(`${table.sql};`);
    lines.push("");

    const rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Record<string, unknown>[];
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map((col) => escapeValue(row[col]));
      lines.push(
        `INSERT INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});`
      );
    }
    lines.push("");
  }

  lines.push("PRAGMA foreign_keys = ON;");

  db.close();

  // Write backup file
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .replace(/\.\d+Z$/, "");
  // Format: YYYYMMDD_HHmmss
  const formattedTimestamp = `${timestamp.slice(0, 8)}_${timestamp.slice(9)}`;
  const filename = `podcasts-${formattedTimestamp}.sql`;
  const outputPath = path.join(BACKUP_DIR, filename);

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");

  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`[backup] Saved ${outputPath} (${sizeMB} MB, ${tables.length} tables)`);
}

main();
