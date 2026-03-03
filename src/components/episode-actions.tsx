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
  Languages,
} from "lucide-react";
import { useState } from "react";
import type { Episode, Podcast } from "@/db/schema";

export function EpisodeActions({
  episode,
  podcast,
  transcriptionStatus,
  translationStatus: translationStatusProp,
}: {
  episode: Episode;
  podcast: Podcast;
  transcriptionStatus: string | null;
  translationStatus: string | null;
}) {
  const router = useRouter();
  const { play } = usePlayer();
  const [downloading, setDownloading] = useState(false);
  const [tsStatus, setTsStatus] = useState(transcriptionStatus);
  const [tlStatus, setTlStatus] = useState(translationStatusProp);
  const [isDone, setIsDone] = useState(episode.done);

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

  const handleTranslate = async () => {
    try {
      const res = await fetch(`/api/transcriptions/${episode.id}/translate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Translation failed: ${data.error}`);
        return;
      }
      setTlStatus("pending");
      router.refresh();
    } catch (err) {
      alert(`Translation failed: ${err}`);
    }
  };

  const handleToggleDone = async () => {
    const newDone = !isDone;
    try {
      const res = await fetch(`/api/episodes/${episode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: newDone }),
      });
      if (res.ok) {
        setIsDone(newDone);
        console.log(`[episode] Toggled done=${newDone}`);
      }
    } catch (err) {
      console.error("[episode] Toggle done failed:", err);
    }
  };

  return (
    <div className="flex flex-col gap-2">
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
            <>
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Transcribed
              </span>

              {(!tlStatus || tlStatus === "completed") && (
                <span className="inline-flex items-center gap-1 text-sm text-green-600">
                  {tlStatus === "completed" ? (
                    <>
                      <Languages className="h-4 w-4" />
                      Translated
                    </>
                  ) : null}
                </span>
              )}
              {(tlStatus === "pending" || tlStatus === "in_progress") && (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Translating...
                </span>
              )}
              {tlStatus === "failed" && (
                <Button variant="outline" size="sm" onClick={handleTranslate}>
                  <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
                  Retry translation
                </Button>
              )}
            </>
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
      <div>
        <Button
          variant={isDone ? "outline" : "ghost"}
          size="sm"
          onClick={handleToggleDone}
          className={isDone ? "text-green-600 border-green-600" : ""}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          {isDone ? "Done — undo?" : "Mark as done"}
        </Button>
      </div>
    </div>
  );
}
