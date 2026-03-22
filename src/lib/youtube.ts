/**
 * Parse a YouTube video ID from various URL formats or a raw 11-char ID.
 * Returns null if the input is not a valid YouTube URL/ID.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace(/^www\./, "");

    // https://youtube.com/watch?v=ID
    if ((hostname === "youtube.com" || hostname === "m.youtube.com") && url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }

    // https://youtube.com/embed/ID
    if (hostname === "youtube.com" && url.pathname.startsWith("/embed/")) {
      const id = url.pathname.split("/")[2];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    // https://youtu.be/ID
    if (hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // not a valid URL
  }

  return null;
}
