"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VocabModeToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onToggle}
      title="Toggle vocabulary mode"
    >
      <Languages className="h-4 w-4" />
      Vocab
    </Button>
  );
}
