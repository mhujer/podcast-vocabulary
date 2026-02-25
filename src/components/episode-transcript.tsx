"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/hooks/use-player";
import { TranscriptDisplay } from "@/components/transcript-display";
import { VocabModeToggle } from "@/components/vocab-mode-toggle";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { CreateFlashcardButton } from "@/components/create-flashcard-button";
import { Loader2 } from "lucide-react";
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

  // Vocab mode state
  const [vocabMode, setVocabMode] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Map<number, Set<number>>>(new Map());
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [creating, setCreating] = useState(false);

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

      // Get word tokens
      const words: string[] = seg.words
        ? seg.words.map((w) => w.word)
        : seg.text.split(/\s+/).filter(Boolean);

      const sorted = [...wordIndices].sort((a, b) => a - b);
      const selectedTexts = sorted.map((i) => words[i]).filter(Boolean);
      // Clean up whitespace in word tokens (whisper often prepends spaces)
      const cleaned = selectedTexts.map((w) => w.trim()).filter(Boolean);

      return {
        segmentIndex: segIdx,
        sentenceText: seg.text.trim(),
        selectedWords: cleaned.join(" "),
      };
    }
    return null;
  }, [selectedWords, state?.segments]);

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
        setFlashcards((prev) => [...prev, card]);
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

  const hasSelection = getSelectedText() !== null;
  const showPanel = vocabMode || flashcards.length > 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Transcript</h2>
        <div className="flex items-center gap-2">
          {vocabMode && (
            <CreateFlashcardButton
              disabled={!hasSelection}
              loading={creating}
              onClick={handleCreate}
            />
          )}
          <VocabModeToggle
            active={vocabMode}
            onToggle={() => {
              setVocabMode((v) => !v);
              setSelectedWords(new Map());
            }}
          />
        </div>
      </div>

      <div className={`flex gap-4 ${showPanel ? "" : ""}`}>
        <div className={showPanel ? "flex-1 min-w-0" : "w-full"}>
          <TranscriptDisplay
            segments={state.segments}
            currentTime={currentTime}
            onSeek={(time) => seek(time)}
            vocabMode={vocabMode}
            selectedWords={selectedWords}
            onWordToggle={handleWordToggle}
          />
        </div>

        {showPanel && (
          <div className="w-80 shrink-0">
            <h3 className="text-sm font-semibold mb-2">Flashcards</h3>
            <FlashcardPanel
              flashcards={flashcards}
              onUpdate={handleFlashcardUpdate}
              onDelete={handleFlashcardDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
