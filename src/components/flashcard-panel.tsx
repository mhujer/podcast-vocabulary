"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Flashcard } from "@/db/schema";
import type { TranscriptionSegment } from "@/types/transcription";
import { formatTimestamp } from "@/components/transcript-display";

export function FlashcardPanel({
  flashcards,
  segments,
  activeSegmentIndex,
  onUpdate,
  onDelete,
  onSegmentClick,
}: {
  flashcards: Flashcard[];
  segments?: TranscriptionSegment[];
  activeSegmentIndex: number;
  onUpdate: (id: string, field: "front" | "back", value: string) => void;
  onDelete: (id: string) => void;
  onSegmentClick?: (segmentIndex: number) => void;
}) {
  const groupRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setGroupRef = useCallback(
    (segIdx: number, el: HTMLDivElement | null) => {
      if (el) {
        groupRefs.current.set(segIdx, el);
      } else {
        groupRefs.current.delete(segIdx);
      }
    },
    []
  );

  // Derive segment indices that have flashcards from props (not refs)
  const flashcardSegmentIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const card of flashcards) indices.add(card.segmentIndex);
    return indices;
  }, [flashcards]);

  // Find the nearest preceding segment that has flashcards
  const highlightedSegmentIndex = useMemo(() => {
    if (activeSegmentIndex < 0) return -1;
    let bestIdx = -1;
    for (const idx of flashcardSegmentIndices) {
      if (idx <= activeSegmentIndex && idx > bestIdx) {
        bestIdx = idx;
      }
    }
    return bestIdx;
  }, [activeSegmentIndex, flashcardSegmentIndices]);

  // Auto-scroll to the highlighted group (ref access is safe inside effects)
  useEffect(() => {
    console.log("[flashcard-panel] scroll effect", { highlightedSegmentIndex, activeSegmentIndex });
    if (highlightedSegmentIndex < 0) return;
    const el = groupRefs.current.get(highlightedSegmentIndex);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedSegmentIndex, activeSegmentIndex]);

  if (flashcards.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No flashcards yet. Select words in the transcript to create one.
      </div>
    );
  }

  // Group by segment index
  const grouped = new Map<number, Flashcard[]>();
  for (const card of flashcards) {
    const list = grouped.get(card.segmentIndex) ?? [];
    list.push(card);
    grouped.set(card.segmentIndex, list);
  }

  // Sort groups by segment index
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a - b);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-2">
        {sortedGroups.map(([segIdx, cards]) => (
          <div
            key={segIdx}
            ref={(el) => setGroupRef(segIdx, el)}
            className={`space-y-2 rounded-md p-1 transition-colors ${
              segIdx === highlightedSegmentIndex
                ? "bg-accent/40"
                : ""
            }`}
          >
            <div
              className="text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground"
              onClick={() => onSegmentClick?.(segIdx)}
            >
              {segments?.[segIdx] ? formatTimestamp(segments[segIdx].start) : `Segment ${segIdx + 1}`}
            </div>
            {cards.map((card) => (
              <FlashcardItem
                key={card.id}
                card={card}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function FlashcardItem({
  card,
  onUpdate,
  onDelete,
}: {
  card: Flashcard;
  onUpdate: (id: string, field: "front" | "back", value: string) => void;
  onDelete: (id: string) => void;
}) {
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  const handleBlur = (field: "front" | "back") => {
    const ref = field === "front" ? frontRef : backRef;
    const value = ref.current?.value ?? "";
    if (value !== card[field]) {
      onUpdate(card.id, field, value);
    }
  };

  return (
    <div className="border rounded-md p-2 space-y-1 bg-card text-card-foreground">
      <div className="flex items-start justify-between gap-1">
        <textarea
          ref={frontRef}
          defaultValue={card.front}
          onBlur={() => handleBlur("front")}
          rows={3}
          className="flex-1 text-xs resize-none bg-transparent border-none outline-none p-1"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onDelete(card.id)}
          title="Delete flashcard"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="border-t" />
      <textarea
        ref={backRef}
        defaultValue={card.back}
        onBlur={() => handleBlur("back")}
        rows={1}
        className="w-full text-xs resize-none bg-transparent border-none outline-none p-1 font-medium"
      />
    </div>
  );
}
