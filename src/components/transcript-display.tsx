"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TranscriptionSegment } from "@/types/transcription";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptDisplay({
  segments,
  currentTime,
  onSegmentClick,
}: {
  segments: TranscriptionSegment[];
  currentTime: number;
  onSegmentClick: (segment: TranscriptionSegment) => void;
}) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = segments.findIndex(
    (seg) => seg.start <= currentTime && currentTime < seg.end
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  return (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-1 p-4">
        {segments.map((seg, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              className={`flex gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-accent/50 transition-colors ${
                isActive ? "bg-primary/15 font-medium" : ""
              }`}
              onClick={() => onSegmentClick(seg)}
            >
              <span className="text-xs text-muted-foreground w-10 shrink-0 pt-0.5 tabular-nums">
                {formatTimestamp(seg.start)}
              </span>
              <span className="text-sm">{seg.text}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
