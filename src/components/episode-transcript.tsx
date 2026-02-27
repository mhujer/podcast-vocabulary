"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/hooks/use-player";
import { TranscriptDisplay, mergeWhisperTokens } from "@/components/transcript-display";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Plus } from "lucide-react";
import type { TranscriptionSegment } from "@/types/transcription";
import type { Flashcard } from "@/db/schema";

type Engine = "whisper" | "parakeet";

interface EngineTranscript {
  engine: Engine;
  status: string;
  segments: TranscriptionSegment[] | null;
  translations: string[] | null;
  translationStatus: string | null;
}

export function EpisodeTranscript({ episodeId: episodeIdProp, podcastName, episodeTitle }: { episodeId?: string; podcastName?: string; episodeTitle?: string } = {}) {
  const { currentEpisode, currentTime, seek } = usePlayer();
  const [engineTranscripts, setEngineTranscripts] = useState<EngineTranscript[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchedEpisodeId, setFetchedEpisodeId] = useState<string | null>(null);
  const episodeId = episodeIdProp ?? currentEpisode?.id ?? null;
  const abortRef = useRef<AbortController | null>(null);

  const [activeEngine, setActiveEngine] = useState<Engine>("whisper");
  const [comparisonMode, setComparisonMode] = useState(false);

  const [selectedWords, setSelectedWords] = useState<Map<number, Set<number>>>(new Map());
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [creating, setCreating] = useState(false);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
  const [visibleSegmentIndex, setVisibleSegmentIndex] = useState(-1);
  const [scrollToSegment, setScrollToSegment] = useState<number | null>(null);

  // Fetch transcriptions (now returns array)
  useEffect(() => {
    if (!episodeId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    fetch(`/api/transcriptions/${episodeId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!json || (Array.isArray(json) && json.length === 0)) {
          setEngineTranscripts([]);
        } else {
          // API now returns array
          const arr = Array.isArray(json) ? json : [json];
          const transcripts: EngineTranscript[] = arr.map((t: Record<string, unknown>) => ({
            engine: (t.engine as Engine) || "whisper",
            status: t.status as string,
            segments: t.status === "completed" ? (t.segments as TranscriptionSegment[] | null) : null,
            translations: (t.translations as string[] | null) ?? null,
            translationStatus: (t.translationStatus as string | null) ?? null,
          }));
          setEngineTranscripts(transcripts);

          // Auto-select first completed engine or first available
          const completed = transcripts.find((t) => t.status === "completed");
          if (completed) {
            setActiveEngine(completed.engine);
          }

          // Auto-enable comparison mode when both have results
          const completedCount = transcripts.filter((t) => t.status === "completed").length;
          if (completedCount >= 2) {
            setComparisonMode(true);
          }
        }
        setFetchedEpisodeId(episodeId);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEngineTranscripts([]);
          setFetchedEpisodeId(episodeId);
          setLoading(false);
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

  const activeTranscript = engineTranscripts.find((t) => t.engine === activeEngine);

  const handleWordToggle = useCallback(
    (segmentIndex: number, wordIndex: number) => {
      setSelectedWords((prev) => {
        const next = new Map<number, Set<number>>();
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
    if (!activeTranscript?.segments) return null;
    for (const [segIdx, wordIndices] of selectedWords) {
      if (wordIndices.size === 0) continue;
      const seg = activeTranscript.segments[segIdx];
      if (!seg) continue;

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
  }, [selectedWords, activeTranscript?.segments]);

  // Compute floating bubble position
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

  const flashcardSegmentIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const card of flashcards) indices.add(card.segmentIndex);
    return indices;
  }, [flashcards]);

  const handleExportAnki = useCallback(() => {
    if (flashcards.length === 0 || !podcastName || !episodeTitle) return;
    const deckName = `Deutsch-Podcasts::${podcastName}::${episodeTitle}`;
    const lines = [
      "#separator:tab",
      `#deck:${deckName}`,
      "#columns:FrontText\tBackText",
      ...flashcards.map(
        (c) =>
          `${c.front.replace(/\n/g, "<br>")}\t${c.back.replace(/\n/g, "<br>")}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${podcastName} - ${episodeTitle}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[vocab] Exported ${flashcards.length} flashcards for Anki`);
  }, [flashcards, podcastName, episodeTitle]);

  if (!episodeId) return null;
  if (loading || fetchedEpisodeId !== episodeId) return null;

  // Check if any engine is in progress
  const inProgress = engineTranscripts.find(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const completedTranscripts = engineTranscripts.filter((t) => t.status === "completed" && t.segments);

  if (completedTranscripts.length === 0) {
    if (inProgress) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 px-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Transcription in progress ({inProgress.engine})...
        </div>
      );
    }
    return null;
  }

  const showComparison = comparisonMode && completedTranscripts.length >= 2;
  const segments = activeTranscript?.segments ?? null;

  if (!segments && !showComparison) return null;

  const activeSegmentIndex = segments
    ? segments.findIndex((seg) => seg.start <= currentTime && currentTime < seg.end)
    : -1;
  const flashcardTargetIndex = visibleSegmentIndex >= 0 ? visibleSegmentIndex : activeSegmentIndex;
  const hasSelection = getSelectedText() !== null;
  const showPanel = flashcards.length > 0;

  // Engine tabs
  const availableEngines = completedTranscripts.map((t) => t.engine);

  return (
    <div className="flex flex-col h-full">
      {/* Engine tabs */}
      {availableEngines.length > 1 && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 border-b">
          {availableEngines.map((eng) => (
            <button
              key={eng}
              onClick={() => {
                setActiveEngine(eng);
                setComparisonMode(false);
                setSelectedWords(new Map());
              }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                !comparisonMode && activeEngine === eng
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {eng === "whisper" ? "Whisper" : "Parakeet"}
            </button>
          ))}
          <button
            onClick={() => setComparisonMode(true)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              comparisonMode
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Side by Side
          </button>
        </div>
      )}

      {/* Content */}
      {showComparison ? (
        <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">
          {completedTranscripts.map((t) => (
            <div key={t.engine} className="flex-1 min-w-0 border-r last:border-r-0 overflow-y-auto">
              <div className="px-3 py-2 border-b bg-muted/50">
                <span className="text-xs font-semibold uppercase">{t.engine === "whisper" ? "Whisper" : "Parakeet"}</span>
              </div>
              <div className="p-2">
                <TranscriptDisplay
                  segments={t.segments!}
                  translations={t.translations}
                  currentTime={currentTime}
                  onSeek={(time) => seek(time)}
                  selectedWords={new Map()}
                  onWordToggle={() => {}}
                  onVisibleSegmentChange={() => {}}
                  flashcardSegments={new Set()}
                  scrollToSegmentIndex={null}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0 p-4">
          <div
            ref={transcriptContainerRef}
            className={`relative ${showPanel ? "flex-1 min-w-0" : "w-full"} h-full`}
          >
            {segments && (
              <TranscriptDisplay
                segments={segments}
                translations={activeTranscript?.translations ?? null}
                currentTime={currentTime}
                onSeek={(time) => seek(time)}
                selectedWords={selectedWords}
                onWordToggle={handleWordToggle}
                onVisibleSegmentChange={setVisibleSegmentIndex}
                flashcardSegments={flashcardSegmentIndices}
                scrollToSegmentIndex={scrollToSegment}
              />
            )}
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
            <div className="w-80 shrink-0 h-full flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Flashcards</h3>
                {podcastName && episodeTitle && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleExportAnki}
                    title="Export to Anki"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <FlashcardPanel
                  flashcards={flashcards}
                  segments={segments!}
                  activeSegmentIndex={flashcardTargetIndex}
                  onUpdate={handleFlashcardUpdate}
                  onDelete={handleFlashcardDelete}
                  onSegmentClick={setScrollToSegment}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
