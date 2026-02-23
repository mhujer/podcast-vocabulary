"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { Play, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Episode, Podcast } from "@/db/schema";

export function EpisodeList({
  episodes,
  podcast,
}: {
  episodes: Episode[];
  podcast: Podcast;
}) {
  const router = useRouter();
  const { play, currentEpisode } = usePlayer();
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());

  const handleDownload = async (episodeId: number) => {
    setDownloadingIds((prev) => new Set(prev).add(episodeId));
    try {
      const res = await fetch(`/api/episodes/${episodeId}/download`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Download failed: ${data.error}`);
      } else {
        router.refresh();
      }
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="divide-y">
      {episodes.map((episode) => {
        const isCurrentlyPlaying = currentEpisode?.id === episode.id;

        return (
          <div
            key={episode.id}
            className={`py-3 flex items-center gap-3 ${isCurrentlyPlaying ? "bg-accent/50 -mx-2 px-2 rounded" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{episode.title}</p>
              <p className="text-xs text-muted-foreground">
                {episode.pubDate && new Date(episode.pubDate).toLocaleDateString()}
                {episode.duration && <> &middot; {formatDuration(episode.duration)}</>}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {episode.filePath ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => play(episode, podcast)}
                  title="Play"
                >
                  <Play className="h-4 w-4" />
                </Button>
              ) : downloadingIds.has(episode.id) ? (
                <Button variant="ghost" size="icon" disabled>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(episode.id)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
