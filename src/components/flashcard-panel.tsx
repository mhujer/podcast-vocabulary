"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Flashcard } from "@/db/schema";

export function FlashcardPanel({
  flashcards,
  onUpdate,
  onDelete,
}: {
  flashcards: Flashcard[];
  onUpdate: (id: string, field: "front" | "back", value: string) => void;
  onDelete: (id: string) => void;
}) {
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

  return (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-4 p-2">
        {[...grouped.entries()].map(([segIdx, cards]) => (
          <div key={segIdx} className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Segment {segIdx + 1}
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
