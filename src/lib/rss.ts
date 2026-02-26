import Parser from "rss-parser";

export interface ParsedEpisode {
  guid: string | undefined;
  title: string;
  description: string | undefined;
  audioUrl: string;
  imageUrl: string | undefined;
  pubDate: string | undefined;
  duration: number | undefined;
}

export interface ParsedFeed {
  title: string;
  description: string | undefined;
  imageUrl: string | undefined;
  episodes: ParsedEpisode[];
}

const parser = new Parser({
  customFields: {
    item: [
      ["itunes:duration", "itunesDuration"],
      ["itunes:image", "itunesImage"],
    ],
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
    .map((item) => {
      const itemAny = item as unknown as Record<string, unknown>;
      const itunesImg = itemAny.itunesImage;
      // itunes:image can be a string or { $: { href: string } }
      const episodeImage = typeof itunesImg === "string"
        ? itunesImg
        : (itunesImg as { $?: { href?: string } } | undefined)?.$?.href;
      return {
        guid: item.guid || undefined,
        title: item.title || "Untitled",
        description: item.contentSnippet || item.content || undefined,
        audioUrl: item.enclosure!.url,
        imageUrl: episodeImage || undefined,
        pubDate: item.isoDate || item.pubDate || undefined,
        duration: parseDuration(itemAny.itunesDuration as string | undefined),
      };
    })
    .sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

  const feedAny = feed as unknown as Record<string, unknown>;
  const itunesImage = (feedAny.itunes as Record<string, unknown> | undefined)?.image;
  const channelImage = (feedAny.image as { url?: string } | undefined)?.url;
  const imageUrl = itunesImage || channelImage || undefined;

  return {
    title: feed.title || "Unknown Podcast",
    description: feed.description || undefined,
    imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
    episodes,
  };
}
