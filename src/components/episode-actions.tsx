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

type Engine = "whisper" | "parakeet" | "canary";

interface EngineStatus {
  status: string | null;
  translationStatus: string | null;
}

export function EpisodeActions({
  episode,
  podcast,
  engineStatuses: engineStatusesProp,
}: {
  episode: Episode;
  podcast: Podcast;
  engineStatuses: Record<Engine, EngineStatus>;
}) {
  const router = useRouter();
  const { play } = usePlayer();
  const [downloading, setDownloading] = useState(false);
  const [statuses, setStatuses] = useState(engineStatusesProp);

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

  const handleTranscribe = async (engine: Engine) => {
    try {
      const res = await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id, engine }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Transcription failed: ${data.error}`);
        return;
      }
      setStatuses((prev) => ({
        ...prev,
        [engine]: { ...prev[engine], status: "pending" },
      }));
      router.refresh();
    } catch (err) {
      alert(`Transcription failed: ${err}`);
    }
  };

  const handleTranscribeAll = async () => {
    await Promise.all([
      handleTranscribe("whisper"),
      handleTranscribe("parakeet"),
      handleTranscribe("canary"),
    ]);
  };

  const handleTranslate = async (engine: Engine) => {
    try {
      const res = await fetch(`/api/transcriptions/${episode.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Translation failed: ${data.error}`);
        return;
      }
      setStatuses((prev) => ({
        ...prev,
        [engine]: { ...prev[engine], translationStatus: "pending" },
      }));
      router.refresh();
    } catch (err) {
      alert(`Translation failed: ${err}`);
    }
  };

  const renderEngineButton = (engine: Engine, label: string) => {
    const s = statuses[engine];
    const tsStatus = s.status;
    const tlStatus = s.translationStatus;

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase w-16">{label}</span>
        {!tsStatus && (
          <Button variant="outline" size="sm" onClick={() => handleTranscribe(engine)}>
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
              Done
            </span>

            {!tlStatus && (
              <Button variant="outline" size="sm" onClick={() => handleTranslate(engine)}>
                <Languages className="h-4 w-4 mr-1" />
                Translate
              </Button>
            )}
            {tlStatus === "completed" && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <Languages className="h-4 w-4" />
                Translated
              </span>
            )}
            {(tlStatus === "pending" || tlStatus === "in_progress") && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Translating...
              </span>
            )}
            {tlStatus === "failed" && (
              <Button variant="outline" size="sm" onClick={() => handleTranslate(engine)}>
                <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
                Retry translation
              </Button>
            )}
          </>
        )}
        {tsStatus === "failed" && (
          <Button variant="outline" size="sm" onClick={() => handleTranscribe(engine)}>
            <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
            Retry
          </Button>
        )}
      </div>
    );
  };

  const allIdle = !statuses.whisper.status && !statuses.parakeet.status && !statuses.canary.status;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {episode.filePath ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => play(episode, podcast)}
          >
            <Play className="h-4 w-4 mr-1" />
            Play
          </Button>
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

        {episode.filePath && allIdle && (
          <Button variant="outline" size="sm" onClick={handleTranscribeAll}>
            <FileText className="h-4 w-4 mr-1" />
            Transcribe All
          </Button>
        )}
      </div>

      {episode.filePath && (
        <div className="flex flex-col gap-1">
          {renderEngineButton("whisper", "Whisper")}
          {renderEngineButton("parakeet", "Parakeet")}
          {renderEngineButton("canary", "Canary")}
        </div>
      )}
    </div>
  );
}
