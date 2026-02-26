"use client";

import { useState } from "react";

export function CollapsibleDescription({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className={`text-sm text-muted-foreground prose prose-sm max-w-none ${
          expanded ? "" : "line-clamp-4"
        }`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
