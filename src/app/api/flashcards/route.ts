import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flashcards, transcriptions } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const flashcardSchema = z.object({
  baseForm: z
    .string()
    .describe(
      "Dictionary/base form of the word or canonical form of the phrase"
    ),
  translation: z
    .string()
    .describe("Czech translation in context of the sentence"),
  exampleSentence: z
    .string()
    .describe(
      "A reworked, self-contained German sentence using the highlighted word that makes sense without any surrounding context"
    ),
});

export async function POST(req: NextRequest) {
  const { episodeId, segmentIndex, sentenceText, selectedWords } =
    await req.json();

  console.log(
    `[flashcards] Creating flashcard: episode=${episodeId} segment=${segmentIndex} words="${selectedWords}"`
  );

  // Fetch surrounding segments for context
  const transcription = await db
    .select()
    .from(transcriptions)
    .where(eq(transcriptions.episodeId, episodeId))
    .then((rows) => rows[0]);

  let contextBefore = "";
  let contextAfter = "";

  if (transcription?.segments) {
    const segments: { text: string }[] = JSON.parse(transcription.segments);
    const startIdx = Math.max(0, segmentIndex - 2);
    const endIdx = Math.min(segments.length - 1, segmentIndex + 2);

    contextBefore = segments
      .slice(startIdx, segmentIndex)
      .map((s) => s.text)
      .join(" ")
      .trim();
    contextAfter = segments
      .slice(segmentIndex + 1, endIdx + 1)
      .map((s) => s.text)
      .join(" ")
      .trim();

    console.log(
      `[flashcards] Context: before="${contextBefore}" after="${contextAfter}"`
    );
  }

  const contextBlock = [
    contextBefore && `Context before: "${contextBefore}"`,
    `Target sentence: "${sentenceText}"`,
    contextAfter && `Context after: "${contextAfter}"`,
  ]
    .filter(Boolean)
    .join("\n");

  const { output } = await generateText({
    model: openai("gpt-5.2"),
    output: Output.object({ schema: flashcardSchema }),
    prompt: `You are a German-Czech language assistant helping build vocabulary flashcards.

Given a German sentence from a podcast with surrounding context and a highlighted word or phrase, return:
- baseForm: the dictionary/base form of the highlighted word(s) in German. For nouns use nominative singular with article and append the plural ending in parentheses, e.g. "der Hund (-e)", "die Katze (-n)", "das Kind (-er)". For irregular/strong verbs use infinitive and append key conjugation forms in parentheses: 3rd person present, preterite, perfect auxiliary + past participle, e.g. "laufen (läuft, lief, ist gelaufen)", "essen (isst, aß, hat gegessen)". For regular/weak verbs just use the infinitive. For adjectives use base form. If it's an idiom or multi-word phrase, return the phrase in its canonical form.
- translation: the Czech translation of the highlighted word(s) in base/dictionary form (e.g. singular nominative for nouns, infinitive for verbs), but choosing the correct meaning based on the sentence context.
- exampleSentence: a simplified, self-contained German sentence using the highlighted word. It must make sense on its own without the podcast context. Keep it natural and concise.

${contextBlock}
Highlighted: "${selectedWords}"`,
  });

  if (!output) {
    return NextResponse.json(
      { error: "LLM returned no output" },
      { status: 500 }
    );
  }

  const front = `${output.baseForm}\n\n(${output.exampleSentence})`;
  const back = output.translation;

  const [card] = await db
    .insert(flashcards)
    .values({
      episodeId,
      segmentIndex,
      front,
      back,
      selectedText: selectedWords,
    })
    .returning();

  console.log(`[flashcards] Created flashcard id=${card.id}`);
  return NextResponse.json(card);
}

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json(
      { error: "episodeId required" },
      { status: 400 }
    );
  }

  const cards = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.episodeId, episodeId))
    .orderBy(asc(flashcards.segmentIndex), asc(flashcards.createdAt));

  return NextResponse.json(cards);
}
