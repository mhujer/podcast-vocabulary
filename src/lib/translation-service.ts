import { transcriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { TranscriptionSegment } from "@/types/transcription";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

const BATCH_SIZE = 30;
const CONTEXT_WINDOW = 2;

function log(...args: unknown[]) {
  console.log("[translation-service]", ...args);
}

export async function translateSegments(
  db: BetterSQLite3Database<typeof schema>,
  transcriptionId: string,
): Promise<void> {
  log("start", { transcriptionId });

  try {
    // Mark as in_progress
    await db.update(transcriptions)
      .set({ translationStatus: "in_progress", translationError: null })
      .where(eq(transcriptions.id, transcriptionId));

    // Fetch transcription
    const [row] = await db.select().from(transcriptions)
      .where(eq(transcriptions.id, transcriptionId));

    if (!row?.segments) {
      throw new Error("No segments found for transcription");
    }

    const segments: TranscriptionSegment[] = JSON.parse(row.segments);
    const allTranslations: string[] = new Array(segments.length).fill("");

    // Process in batches
    for (let batchStart = 0; batchStart < segments.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, segments.length);
      const batchSegments = segments.slice(batchStart, batchEnd);

      // Build context: ±CONTEXT_WINDOW segments around the batch
      const contextStart = Math.max(0, batchStart - CONTEXT_WINDOW);
      const contextEnd = Math.min(segments.length, batchEnd + CONTEXT_WINDOW);
      const contextBefore = segments.slice(contextStart, batchStart).map(s => s.text);
      const contextAfter = segments.slice(batchEnd, contextEnd).map(s => s.text);

      const numberedSegments = batchSegments
        .map((s, i) => `[${i + 1}] ${s.text}`)
        .join("\n");

      const prompt = [
        "Translate each numbered German segment to Czech. Return exactly one translation per segment, preserving the numbering order.",
        "",
        contextBefore.length > 0 ? `Context before:\n${contextBefore.join("\n")}\n` : "",
        `Segments to translate:\n${numberedSegments}`,
        "",
        contextAfter.length > 0 ? `Context after:\n${contextAfter.join("\n")}` : "",
      ].filter(Boolean).join("\n");

      log(`batch ${batchStart}-${batchEnd} of ${segments.length}`);

      const { output } = await generateText({
        model: openai("gpt-4.1-mini"),
        output: Output.object({
          schema: z.object({
            translations: z.array(z.string()),
          }),
        }),
        prompt,
      });

      if (!output?.translations) {
        throw new Error(`LLM returned no output for batch ${batchStart}-${batchEnd}`);
      }

      // Fill in translations for this batch
      for (let i = 0; i < batchSegments.length; i++) {
        allTranslations[batchStart + i] = output.translations[i] ?? "";
      }
    }

    // Save completed translations
    await db.update(transcriptions)
      .set({
        translationStatus: "completed",
        translations: JSON.stringify(allTranslations),
      })
      .where(eq(transcriptions.id, transcriptionId));

    log("completed", { transcriptionId, count: allTranslations.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR:", message);
    await db.update(transcriptions)
      .set({ translationStatus: "failed", translationError: message })
      .where(eq(transcriptions.id, transcriptionId));
  }
}
