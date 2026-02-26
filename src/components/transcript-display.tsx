"use client";

import { useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TranscriptionSegment } from "@/types/transcription";

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptDisplay({
  segments,
  currentTime,
  onSeek,
  selectedWords,
  onWordToggle,
  onVisibleSegmentChange,
}: {
  segments: TranscriptionSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
  selectedWords: Map<number, Set<number>>;
  onWordToggle: (segmentIndex: number, wordIndex: number) => void;
  onVisibleSegmentChange?: (index: number) => void;
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = segments.findIndex(
    (seg) => seg.start <= currentTime && currentTime < seg.end
  );

  // Track which segment is visible in the scroll viewport
  const elementToIndexRef = useRef<Map<Element, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const onVisibleSegmentChangeRef = useRef(onVisibleSegmentChange);
  useEffect(() => {
    onVisibleSegmentChangeRef.current = onVisibleSegmentChange;
  }, [onVisibleSegmentChange]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible segment
        let topIndex = -1;
        let topY = Infinity;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = elementToIndexRef.current.get(entry.target);
            if (idx !== undefined && entry.boundingClientRect.top < topY) {
              topY = entry.boundingClientRect.top;
              topIndex = idx;
            }
          }
        }
        if (topIndex >= 0) {
          console.log("[transcript] visible segment:", topIndex);
          onVisibleSegmentChangeRef.current?.(topIndex);
        }
      },
      { root, threshold: 0.5 }
    );

    // Observe all currently tracked elements
    for (const el of elementToIndexRef.current.keys()) {
      observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [segments]);

  const setSegmentRef = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      // Clean up old element for this index
      for (const [existingEl, idx] of elementToIndexRef.current) {
        if (idx === index) {
          elementToIndexRef.current.delete(existingEl);
          observerRef.current?.unobserve(existingEl);
          break;
        }
      }
      if (el) {
        elementToIndexRef.current.set(el, index);
        observerRef.current?.observe(el);
      }
    },
    []
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  return (
    <ScrollArea className="h-full" viewportRef={scrollRootRef}>
      <div className="space-y-1 p-4">
        {segments.map((seg, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              ref={(el) => {
                if (isActive) activeRef.current = el;
                setSegmentRef(i, el);
              }}
              className={`flex gap-3 px-2 py-1.5 rounded transition-colors ${
                isActive ? "bg-primary/15 font-medium" : ""
              }`}
            >
              <span
                className="text-xs text-muted-foreground w-10 shrink-0 pt-0.5 tabular-nums cursor-pointer hover:text-foreground"
                onClick={() => onSeek(seg.start)}
              >
                {formatTimestamp(seg.start)}
              </span>
              <span className="text-sm">
                <VocabWords
                  seg={seg}
                  segIndex={i}
                  isActive={isActive}
                  currentTime={currentTime}
                  selected={selectedWords.get(i)}
                  onWordToggle={onWordToggle}
                />
              </span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * Merge Whisper sub-word tokens into whole words.
 * Whisper tokens that start with a space (or are the first token) begin a new word;
 * tokens without leading space are continuations of the previous word.
 */
export function mergeWhisperTokens(
  tokens: { word: string; start: number; end: number }[]
): { text: string; start: number; end: number }[] {
  const merged: { text: string; start: number; end: number }[] = [];
  for (const t of tokens) {
    if (merged.length > 0 && !t.word.startsWith(" ")) {
      // Continuation of previous word
      const last = merged[merged.length - 1];
      last.text += t.word;
      last.end = t.end;
    } else {
      merged.push({ text: t.word.trim(), start: t.start, end: t.end });
    }
  }
  return merged;
}

function VocabWords({
  seg,
  segIndex,
  isActive,
  currentTime,
  selected,
  onWordToggle,
}: {
  seg: TranscriptionSegment;
  segIndex: number;
  isActive: boolean;
  currentTime: number;
  selected?: Set<number>;
  onWordToggle?: (segmentIndex: number, wordIndex: number) => void;
}) {
  // Merge sub-word tokens into whole words, or split on whitespace as fallback
  const words: { text: string; start?: number; end?: number }[] = seg.words
    ? mergeWhisperTokens(seg.words)
    : seg.text.split(/(\s+)/).map((token) => ({ text: token }));

  let wordIdx = 0;
  return (
    <>
      {words.map((w, i) => {
        // Whitespace-only tokens from split are not clickable
        if (!seg.words && /^\s+$/.test(w.text)) {
          return <span key={i}>{w.text}</span>;
        }

        const currentWordIdx = wordIdx++;
        const isSelected = selected?.has(currentWordIdx) ?? false;
        const isActiveWord =
          isActive &&
          w.start !== undefined &&
          w.end !== undefined &&
          w.start <= currentTime &&
          currentTime < w.end;

        let className = "cursor-pointer rounded px-0.5 hover:bg-accent/50";
        if (isSelected) className += " bg-yellow-300/50";
        if (isActiveWord) className += " bg-primary/30";

        return (
          <span
            key={i}
            className={className}
            data-selected-word={isSelected ? "" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onWordToggle?.(segIndex, currentWordIdx);
            }}
          >
            {seg.words && currentWordIdx > 0 && " "}
            {w.text}
          </span>
        );
      })}
    </>
  );
}
