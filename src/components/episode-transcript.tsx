"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePlayer } from "@/hooks/use-player";
import { TranscriptDisplay, mergeWhisperTokens } from "@/components/transcript-display";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import type { TranscriptionSegment } from "@/types/transcription";
import type { Flashcard } from "@/db/schema";

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

  const [selectedWords, setSelectedWords] = useState<Map<number, Set<number>>>(new Map());
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [creating, setCreating] = useState(false);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
  const [visibleSegmentIndex, setVisibleSegmentIndex] = useState(-1);

  // Fetch transcription
  useEffect(() => {
    if (!episodeId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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

  // Fetch flashcards
  useEffect(() => {
    if (!episodeId) return;
    fetch(`/api/flashcards?episodeId=${episodeId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setFlashcards)
      .catch(() => setFlashcards([]));
  }, [episodeId]);

  const handleWordToggle = useCallback(
    (segmentIndex: number, wordIndex: number) => {
      setSelectedWords((prev) => {
        const next = new Map<number, Set<number>>();
        // Only allow selection in one segment at a time
        const existing = prev.get(segmentIndex);
        const set = new Set(existing);
        if (set.has(wordIndex)) {
          set.delete(wordIndex);
        } else {
          set.add(wordIndex);
        }
        if (set.size > 0) {
          next.set(segmentIndex, set);
        }
        return next;
      });
    },
    []
  );

  const getSelectedText = useCallback(() => {
    if (!state?.segments) return null;
    for (const [segIdx, wordIndices] of selectedWords) {
      if (wordIndices.size === 0) continue;
      const seg = state.segments[segIdx];
      if (!seg) continue;

      // Get word tokens (merge sub-word tokens into whole words)
      const words: string[] = seg.words
        ? mergeWhisperTokens(seg.words).map((w) => w.text)
        : seg.text.split(/\s+/).filter(Boolean);

      const sorted = [...wordIndices].sort((a, b) => a - b);
      const cleaned = sorted.map((i) => words[i]).filter(Boolean);

      return {
        segmentIndex: segIdx,
        sentenceText: seg.text.trim(),
        selectedWords: cleaned.join(" "),
      };
    }
    return null;
  }, [selectedWords, state?.segments]);

  // Compute floating bubble position from selected word elements
  useLayoutEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container || !getSelectedText()) {
      setBubblePos(null);
      return;
    }
    const spans = container.querySelectorAll<HTMLElement>("[data-selected-word]");
    if (spans.length === 0) {
      setBubblePos(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const lastSpan = spans[spans.length - 1];
    const spanRect = lastSpan.getBoundingClientRect();
    setBubblePos({
      top: spanRect.bottom - containerRect.top + 4,
      left: spanRect.right - containerRect.left + 8,
    });
  }, [selectedWords, getSelectedText]);

  const handleCreate = useCallback(async () => {
    const sel = getSelectedText();
    if (!sel || !episodeId) return;

    setCreating(true);
    console.log(`[vocab] Creating flashcard for "${sel.selectedWords}"`);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          segmentIndex: sel.segmentIndex,
          sentenceText: sel.sentenceText,
          selectedWords: sel.selectedWords,
        }),
      });
      if (res.ok) {
        const card = await res.json();
        setFlashcards((prev) => {
          const next = [...prev, card];
          next.sort((a, b) => a.segmentIndex - b.segmentIndex || a.createdAt.localeCompare(b.createdAt));
          return next;
        });
        setSelectedWords(new Map());
      } else {
        const err = await res.text();
        console.error(`[vocab] Create failed: ${err}`);
      }
    } catch (err) {
      console.error("[vocab] Create error:", err);
    } finally {
      setCreating(false);
    }
  }, [episodeId, getSelectedText]);

  const handleFlashcardUpdate = useCallback(
    async (id: string, field: "front" | "back", value: string) => {
      console.log(`[vocab] Updating flashcard ${id} ${field}`);
      const res = await fetch(`/api/flashcards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFlashcards((prev) =>
          prev.map((c) => (c.id === id ? updated : c))
        );
      }
    },
    []
  );

  const handleFlashcardDelete = useCallback(async (id: string) => {
    console.log(`[vocab] Deleting flashcard ${id}`);
    await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
  }, []);

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

  const activeSegmentIndex = state.segments.findIndex(
    (seg) => seg.start <= currentTime && currentTime < seg.end
  );
  const flashcardTargetIndex = visibleSegmentIndex >= 0 ? visibleSegmentIndex : activeSegmentIndex;
  const hasSelection = getSelectedText() !== null;
  const showPanel = flashcards.length > 0;

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-2">Transcript</h2>

      <div className={`flex gap-4`}>
        <div
          ref={transcriptContainerRef}
          className={`relative ${showPanel ? "flex-1 min-w-0" : "w-full"}`}
        >
          <TranscriptDisplay
            segments={state.segments}
            currentTime={currentTime}
            onSeek={(time) => seek(time)}
            selectedWords={selectedWords}
            onWordToggle={handleWordToggle}
            onVisibleSegmentChange={setVisibleSegmentIndex}
          />
          {hasSelection && bubblePos && (
            <div
              className="absolute z-50"
              style={{ top: bubblePos.top, left: bubblePos.left }}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={creating}
                onClick={handleCreate}
                className="shadow-md"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create Flashcard
              </Button>
            </div>
          )}
        </div>

        {showPanel && (
          <div className="w-80 shrink-0">
            <h3 className="text-sm font-semibold mb-2">Flashcards</h3>
            <FlashcardPanel
              flashcards={flashcards}
              segments={state.segments}
              activeSegmentIndex={flashcardTargetIndex}
              onUpdate={handleFlashcardUpdate}
              onDelete={handleFlashcardDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
