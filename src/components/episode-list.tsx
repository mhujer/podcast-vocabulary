"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { Play, Download, Loader2, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Episode, Podcast } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

interface TranscriptionStatus {
  episodeId: string;
  status: string;
  errorMessage: string | null;
}

export function EpisodeList({
  episodes,
  podcast,
  flashcardCounts = {},
}: {
  episodes: Episode[];
  podcast: Podcast;
  flashcardCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { play, currentEpisode } = usePlayer();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, TranscriptionStatus>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const downloadedIdsKey = episodes.filter((e) => e.filePath).map((e) => e.id).join(",");

  const fetchStatuses = useCallback(async () => {
    const ids = downloadedIdsKey.split(",").filter(Boolean);
    if (!ids.length) return;
    try {
      const res = await fetch(`/api/transcriptions?episodeIds=${downloadedIdsKey}`);
      const rows: TranscriptionStatus[] = await res.json();
      const map: Record<string, TranscriptionStatus> = {};
      for (const row of rows) {
        map[row.episodeId] = row;
      }
      setStatuses(map);
    } catch {
      // ignore
    }
  }, [downloadedIdsKey]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  // Poll for in-progress transcriptions
  useEffect(() => {
    const hasActive = Object.values(statuses).some(
      (s) => s.status === "pending" || s.status === "in_progress"
    );
    if (hasActive) {
      pollRef.current = setInterval(fetchStatuses, 3000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [statuses, fetchStatuses]);

  const handleDownload = async (episodeId: string) => {
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

  const handleTranscribe = async (episodeId: string) => {
    try {
      const res = await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Transcription failed: ${data.error}`);
        return;
      }
      // Immediately show pending
      setStatuses((prev) => ({
        ...prev,
        [episodeId]: { episodeId, status: "pending", errorMessage: null },
      }));
    } catch (err) {
      alert(`Transcription failed: ${err}`);
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
        const ts = statuses[episode.id];

        return (
          <div
            key={episode.id}
            className={`py-3 flex items-center gap-3 ${isCurrentlyPlaying ? "bg-accent/50 -mx-2 px-2 rounded" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/podcasts/${podcast.id}/episodes/${episode.id}`}
                className="text-sm font-medium truncate block hover:underline"
              >
                {episode.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {episode.pubDate && new Date(episode.pubDate).toLocaleDateString()}
                {episode.duration && <> &middot; {formatDuration(episode.duration)}</>}
                {episode.done && (
                  <Badge variant="default" className="ml-2 bg-green-600 text-white text-[10px] px-1.5 py-0">Done</Badge>
                )}
                {!episode.done && (flashcardCounts[episode.id] ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-[10px] px-1.5 py-0">{flashcardCounts[episode.id]} cards</Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {episode.filePath ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => play(episode, podcast)}
                    title="Play"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  {/* Transcription status */}
                  {!ts && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTranscribe(episode.id)}
                      title="Transcribe"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  {ts?.status === "pending" || ts?.status === "in_progress" ? (
                    <Button variant="ghost" size="icon" disabled>
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </Button>
                  ) : null}
                  {ts?.status === "completed" && (
                    <CheckCircle className="h-4 w-4 text-green-500 mx-2" />
                  )}
                  {ts?.status === "failed" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTranscribe(episode.id)}
                      title={ts.errorMessage ?? "Transcription failed — click to retry"}
                    >
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </>
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
