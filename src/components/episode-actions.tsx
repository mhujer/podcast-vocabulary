"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import {
  Play,
  Download,
  Loader2,
  FileText,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import type { Episode, Podcast } from "@/db/schema";

export function EpisodeActions({
  episode,
  podcast,
  transcriptionStatus,
}: {
  episode: Episode;
  podcast: Podcast;
  transcriptionStatus: string | null;
}) {
  const router = useRouter();
  const { play } = usePlayer();
  const [downloading, setDownloading] = useState(false);
  const [tsStatus, setTsStatus] = useState(transcriptionStatus);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/episodes/${episode.id}/download`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Download failed: ${data.error}`);
      } else {
        router.refresh();
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleTranscribe = async () => {
    try {
      const res = await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Transcription failed: ${data.error}`);
        return;
      }
      setTsStatus("pending");
      router.refresh();
    } catch (err) {
      alert(`Transcription failed: ${err}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {episode.filePath ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => play(episode, podcast)}
          >
            <Play className="h-4 w-4 mr-1" />
            Play
          </Button>

          {!tsStatus && (
            <Button variant="outline" size="sm" onClick={handleTranscribe}>
              <FileText className="h-4 w-4 mr-1" />
              Transcribe
            </Button>
          )}
          {(tsStatus === "pending" || tsStatus === "in_progress") && (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Transcribing...
            </Button>
          )}
          {tsStatus === "completed" && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Transcribed
            </span>
          )}
          {tsStatus === "failed" && (
            <Button variant="outline" size="sm" onClick={handleTranscribe}>
              <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
              Retry transcription
            </Button>
          )}
        </>
      ) : downloading ? (
        <Button variant="outline" size="sm" disabled>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Downloading...
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
      )}
    </div>
  );
}
