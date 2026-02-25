import { db } from "@/db";
import { podcasts } from "@/db/schema";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { addPodcast } from "./podcast-service";

const DATA_DIR = join(process.cwd(), "data");
const OPML_PATH = join(DATA_DIR, "subscribed.opml");

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function exportOpml(feeds: { name: string; rssUrl: string }[]): string {
  const outlines = feeds
    .map(
      (f) =>
        `      <outline type="rss" text="${escapeXml(f.name)}" xmlUrl="${escapeXml(f.rssUrl)}" />`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Podcast Subscriptions</title>
  </head>
  <body>
    <outline text="feeds">
${outlines}
    </outline>
  </body>
</opml>
`;
}

export function parseOpml(xml: string): { name: string; rssUrl: string }[] {
  const feeds: { name: string; rssUrl: string }[] = [];

  for (const match of xml.matchAll(/<outline[^>]+>/gi)) {
    const tag = match[0];
    if (!/type=["']rss["']/i.test(tag)) continue;

    const xmlUrlMatch = tag.match(/xmlUrl=["']([^"']+)["']/i);
    const textMatch = tag.match(/text=["']([^"']+)["']/i);

    if (xmlUrlMatch) {
      feeds.push({
        name: textMatch ? textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'") : "",
        rssUrl: xmlUrlMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
      });
    }
  }

  return feeds;
}

export async function writeOpmlFile(): Promise<void> {
  const allPodcasts = await db
    .select({ name: podcasts.name, rssUrl: podcasts.rssUrl })
    .from(podcasts);

  const xml = exportOpml(allPodcasts);
  writeFileSync(OPML_PATH, xml, "utf-8");
  console.log(`[OPML] Exported ${allPodcasts.length} podcasts to ${OPML_PATH}`);
}

export async function importFromOpml(): Promise<void> {
  if (!existsSync(OPML_PATH)) {
    console.log("[OPML] No subscribed.opml found, skipping import");
    return;
  }

  const xml = readFileSync(OPML_PATH, "utf-8");
  const feeds = parseOpml(xml);
  console.log(`[OPML] Found ${feeds.length} feeds in subscribed.opml`);

  for (const feed of feeds) {
    try {
      console.log(`[OPML] Importing: ${feed.name || feed.rssUrl}`);
      await addPodcast(feed.rssUrl);
      console.log(`[OPML] Imported: ${feed.name || feed.rssUrl}`);
    } catch (err) {
      console.error(`[OPML] Failed to import ${feed.rssUrl}: ${err}`);
    }
  }
}
