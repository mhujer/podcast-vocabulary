import Parser from "rss-parser";

export interface ParsedEpisode {
  guid: string | undefined;
  title: string;
  description: string | undefined;
  audioUrl: string;
  pubDate: string | undefined;
  duration: number | undefined;
}

export interface ParsedFeed {
  title: string;
  description: string | undefined;
  episodes: ParsedEpisode[];
}

const parser = new Parser({
  customFields: {
    item: [["itunes:duration", "itunesDuration"]],
  },
});

function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  // Pure seconds
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  // HH:MM:SS or MM:SS
  const parts = raw.split(":").map(Number);
  if (parts.some(isNaN)) return undefined;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];

  return undefined;
}

export async function parseFeed(rssUrl: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(rssUrl);

  const episodes: ParsedEpisode[] = (feed.items || [])
    .filter((item) => item.enclosure?.url)
    .map((item) => ({
      guid: item.guid || undefined,
      title: item.title || "Untitled",
      description: item.contentSnippet || item.content || undefined,
      audioUrl: item.enclosure!.url,
      pubDate: item.isoDate || item.pubDate || undefined,
      duration: parseDuration(
        (item as unknown as Record<string, unknown>).itunesDuration as string | undefined
      ),
    }))
    .sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

  return {
    title: feed.title || "Unknown Podcast",
    description: feed.description || undefined,
    episodes,
  };
}
