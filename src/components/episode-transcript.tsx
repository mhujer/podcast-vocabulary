"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/hooks/use-player";
import { TranscriptDisplay } from "@/components/transcript-display";
import { Loader2 } from "lucide-react";
import type { TranscriptionSegment } from "@/types/transcription";

interface TranscriptState {
  episodeId: string;
  loading: boolean;
  status: string | null;
  segments: TranscriptionSegment[] | null;
}

export function EpisodeTranscript({ episodeId: episodeIdProp }: { episodeId?: string } = {}) {
  const { currentEpisode, currentTime, seek } = usePlayer();
  const [state, setState] = useState<TranscriptState | null>(null);
  const episodeId = episodeIdProp ?? currentEpisode?.id ?? null;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!episodeId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Set loading via a microtask to avoid synchronous setState in effect
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setState({ episodeId, loading: true, status: null, segments: null });
    });

    fetch(`/api/transcriptions/${episodeId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json) {
          setState({ episodeId, loading: false, status: null, segments: null });
        } else {
          setState({
            episodeId,
            loading: false,
            status: json.status,
            segments: json.status === "completed" ? json.segments : null,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ episodeId, loading: false, status: null, segments: null });
        }
      });

    return () => {
      controller.abort();
    };
  }, [episodeId]);

  if (!episodeId) return null;
  if (!state || state.episodeId !== episodeId || state.loading) return null;

  if (state.status === "pending" || state.status === "in_progress") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Transcription in progress...
      </div>
    );
  }

  if (!state.segments) return null;

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-2">Transcript</h2>
      <TranscriptDisplay
        segments={state.segments}
        currentTime={currentTime}
        onSeek={(time) => seek(time)}
      />
    </div>
  );
}
